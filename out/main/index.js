"use strict";
const electron = require("electron");
const path = require("path");
const initSqlJs = require("sql.js");
const fs = require("fs");
const Store = require("electron-store");
const yaml = require("js-yaml");
const Fuse = require("fuse.js");
const child_process = require("child_process");
const chokidar = require("chokidar");
let _sqlPromise = null;
function getSql() {
  if (!_sqlPromise) _sqlPromise = initSqlJs();
  return _sqlPromise;
}
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS roms (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    title         TEXT NOT NULL,
    filename      TEXT NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    matched_title TEXT,
    scanned_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_roms_platform ON roms(platform);
  CREATE INDEX IF NOT EXISTS idx_roms_title    ON roms(title);
`;
async function openDb(dbPath) {
  const SQL = await getSql();
  let db2;
  {
    db2 = new SQL.Database();
  }
  db2.exec(SCHEMA);
  return db2;
}
function upsertRom(db2, rom) {
  db2.run(
    `INSERT INTO roms (platform, title, filename, path, size_bytes, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       platform   = excluded.platform,
       title      = excluded.title,
       filename   = excluded.filename,
       size_bytes = excluded.size_bytes,
       scanned_at = excluded.scanned_at`,
    [rom.platform, rom.title, rom.filename, rom.path, rom.sizeBytes, Math.floor(Date.now() / 1e3)]
  );
}
function queryRomsByPlatform(db2, platform) {
  const stmt = db2.prepare(
    `SELECT id, platform, title, filename, path,
            size_bytes AS sizeBytes, scanned_at AS scannedAt
     FROM roms WHERE platform = ?`
  );
  stmt.bind([platform]);
  const rows = [];
  while (stmt.step()) {
    const obj = stmt.getAsObject();
    rows.push({
      id: obj["id"],
      platform: obj["platform"],
      title: obj["title"],
      filename: obj["filename"],
      path: obj["path"],
      sizeBytes: obj["sizeBytes"],
      scannedAt: obj["scannedAt"]
    });
  }
  stmt.free();
  return rows;
}
function queryAllRoms(db2) {
  const stmt = db2.prepare(
    `SELECT id, platform, title, filename, path,
            size_bytes AS sizeBytes, scanned_at AS scannedAt
     FROM roms`
  );
  const rows = [];
  while (stmt.step()) {
    const obj = stmt.getAsObject();
    rows.push({
      id: obj["id"],
      platform: obj["platform"],
      title: obj["title"],
      filename: obj["filename"],
      path: obj["path"],
      sizeBytes: obj["sizeBytes"],
      scannedAt: obj["scannedAt"]
    });
  }
  stmt.free();
  return rows;
}
const store = new Store({
  defaults: {
    libraryPath: "",
    fuzzyMatchThreshold: 0.6
  }
});
function getConfig() {
  return {
    libraryPath: store.get("libraryPath"),
    fuzzyMatchThreshold: store.get("fuzzyMatchThreshold")
  };
}
function setConfig(patch) {
  if (patch.libraryPath !== void 0) store.set("libraryPath", patch.libraryPath);
  if (patch.fuzzyMatchThreshold !== void 0) store.set("fuzzyMatchThreshold", patch.fuzzyMatchThreshold);
  return getConfig();
}
const STRIP_PARENS = /\s*\((?:USA|Europe|Japan|World|Rev\s*\w+|v[\d.]+|En|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Pl|Ru|Zh|Ko|[A-Z]{2,3}(?:,\s*[A-Z]{2,3})*)\)/gi;
function normalizeTitle(raw) {
  return raw.replace(/\.[a-z0-9]{1,5}$/i, "").replace(STRIP_PARENS, "").replace(/[^a-z0-9 ]/gi, " ").toLowerCase().replace(/\s+/g, " ").trim();
}
async function scanLibrary(db2, libraryPath, onProgress) {
  const platforms = fs.readdirSync(libraryPath).filter((entry) => {
    try {
      return fs.statSync(path.join(libraryPath, entry)).isDirectory();
    } catch {
      return false;
    }
  });
  let current = 0;
  for (const platform of platforms) {
    const platformDir = path.join(libraryPath, platform);
    let files;
    try {
      files = fs.readdirSync(platformDir).filter((f) => {
        if (f.startsWith(".") || f.toLowerCase().endsWith(".txt")) return false;
        try {
          return fs.statSync(path.join(platformDir, f)).isFile();
        } catch {
          return false;
        }
      });
    } catch {
      continue;
    }
    for (const filename of files) {
      const path$1 = path.join(platformDir, filename);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(path$1).size;
      } catch {
      }
      try {
        upsertRom(db2, {
          platform,
          title: normalizeTitle(filename),
          filename,
          path: path$1,
          sizeBytes
        });
      } catch {
      }
      current++;
      onProgress({ current, total: null, currentFile: filename });
    }
  }
}
function loadPlaylist(filePath) {
  const stem = path.basename(filePath, ".yaml");
  const issues = [];
  let raw;
  try {
    raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, playlist: null, issues: [{ severity: "error", message: `YAML parse error: ${msg}` }] };
  }
  if (!raw || typeof raw !== "object") {
    return { valid: false, playlist: null, issues: [{ severity: "error", message: "Playlist file is empty or not an object" }] };
  }
  const doc = raw;
  if (!doc["name"] || typeof doc["name"] !== "string") {
    issues.push({ severity: "error", message: "Missing required field: name" });
  }
  const topPlatform = typeof doc["platform"] === "string" ? doc["platform"] : null;
  const includesRaw = Array.isArray(doc["includes"]) ? doc["includes"].filter((x) => typeof x === "string") : [];
  const entries = [];
  if (topPlatform) {
    if (!Array.isArray(doc["entries"])) {
      issues.push({ severity: "error", message: "entries must be a list for single-platform playlists" });
    } else {
      for (const e of doc["entries"]) {
        if (typeof e === "string") entries.push({ raw: e, platform: topPlatform });
      }
    }
  } else {
    if (doc["entries"] && typeof doc["entries"] === "object" && !Array.isArray(doc["entries"])) {
      for (const [platform, list] of Object.entries(doc["entries"])) {
        if (Array.isArray(list)) {
          for (const e of list) {
            if (typeof e === "string") entries.push({ raw: e, platform });
          }
        }
      }
    } else if (doc["entries"] !== void 0) {
      issues.push({ severity: "error", message: "entries must be a platform-keyed map for cross-platform playlists" });
    }
  }
  if (issues.some((i) => i.severity === "error")) {
    return { valid: false, playlist: null, issues };
  }
  return {
    valid: true,
    issues,
    playlist: {
      stem,
      name: doc["name"],
      platform: topPlatform,
      entries,
      includes: includesRaw,
      filePath
    }
  };
}
function loadAllPlaylists(playlistsDir2) {
  let files;
  try {
    files = fs.readdirSync(playlistsDir2).filter((f) => f.endsWith(".yaml"));
  } catch {
    return [];
  }
  return files.map((f) => loadPlaylist(path.join(playlistsDir2, f)));
}
function resolvePlaylist(stem, allPlaylists, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(stem)) {
    return { entries: [], error: `Circular include detected: ${[...visited, stem].join(" → ")}` };
  }
  const playlist = allPlaylists[stem];
  if (!playlist) {
    return { entries: [], error: `Playlist not found: ${stem}` };
  }
  visited.add(stem);
  const allEntries = [...playlist.entries];
  for (const includeStem of playlist.includes) {
    const sub = resolvePlaylist(includeStem, allPlaylists, new Set(visited));
    if (sub.error) return { entries: [], error: sub.error };
    allEntries.push(...sub.entries);
  }
  return { entries: allEntries, error: null };
}
function matchEntries(db2, entries, threshold) {
  const byPlatform = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const list = byPlatform.get(entry.platform) ?? [];
    list.push(entry);
    byPlatform.set(entry.platform, list);
  }
  const resultMap = /* @__PURE__ */ new Map();
  for (const [platform, platformEntries] of byPlatform) {
    const roms = queryRomsByPlatform(db2, platform);
    const fuse = new Fuse(roms, {
      keys: ["title"],
      threshold: threshold * threshold,
      includeScore: true,
      shouldSort: true
    });
    for (const entry of platformEntries) {
      const normalized = normalizeTitle(entry.raw);
      const exact = roms.find((r) => r.title === normalized);
      if (exact) {
        resultMap.set(entry, { entry, status: "exact", rom: exact, score: null });
        continue;
      }
      const hits = fuse.search(normalized);
      if (hits.length > 0 && hits[0].score !== void 0 && hits[0].score <= threshold) {
        resultMap.set(entry, {
          entry,
          status: "fuzzy",
          rom: hits[0].item,
          score: hits[0].score
        });
      } else {
        resultMap.set(entry, { entry, status: "none", rom: null, score: null });
      }
    }
  }
  return entries.map((e) => resultMap.get(e));
}
function readDeviceConfig(mountPoint) {
  const configPath = path.join(mountPoint, "rom-sync.yaml");
  if (!fs.existsSync(configPath)) {
    return { config: null, error: "rom-sync.yaml not found on this volume" };
  }
  let raw;
  try {
    raw = yaml.load(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    return { config: null, error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!raw || typeof raw !== "object") {
    return { config: null, error: "rom-sync.yaml is empty or not an object" };
  }
  const doc = raw;
  if (!doc["device_name"] || typeof doc["device_name"] !== "string") {
    return { config: null, error: "Missing required field: device_name" };
  }
  if (!doc["platforms"] || typeof doc["platforms"] !== "object" || Array.isArray(doc["platforms"])) {
    return { config: null, error: "Missing or invalid field: platforms (must be a map)" };
  }
  return {
    config: {
      deviceName: doc["device_name"],
      platforms: doc["platforms"]
    },
    error: null
  };
}
function listMountedVolumes() {
  try {
    const volumes = fs.readdirSync("/Volumes");
    return volumes.map((name) => {
      const mountPoint = `/Volumes/${name}`;
      try {
        if (!fs.statSync(mountPoint).isDirectory()) return null;
        const dfOut = child_process.execFileSync("df", ["-k", mountPoint], { encoding: "utf-8" });
        const lines = dfOut.trim().split("\n");
        const parts = lines[1].trim().split(/\s+/);
        const totalBytes = parseInt(parts[1]) * 1024;
        const usedBytes = parseInt(parts[2]) * 1024;
        const availableBytes = totalBytes - usedBytes;
        return { name, mountPoint, availableBytes, totalBytes };
      } catch {
        return null;
      }
    }).filter((v) => v !== null);
  } catch {
    return [];
  }
}
function computeSyncPreview(matches, deviceConfig, cardMountPoint) {
  const toCopy = [];
  const skipped = [];
  const keepByDir = /* @__PURE__ */ new Map();
  for (const match of matches) {
    if (match.status === "none" || !match.rom) {
      skipped.push(match);
      continue;
    }
    const platformRelPath = deviceConfig.platforms[match.rom.platform];
    if (!platformRelPath) {
      skipped.push(match);
      continue;
    }
    const destDir = path.join(cardMountPoint, platformRelPath);
    const destPath = path.join(destDir, match.rom.filename);
    if (!keepByDir.has(destDir)) keepByDir.set(destDir, /* @__PURE__ */ new Set());
    keepByDir.get(destDir).add(match.rom.filename);
    if (!fs.existsSync(destPath)) {
      toCopy.push({ rom: match.rom, destination: destPath });
    }
  }
  const toDelete = [];
  for (const platformRelPath of Object.values(deviceConfig.platforms)) {
    const dir = path.join(cardMountPoint, platformRelPath);
    if (!fs.existsSync(dir)) continue;
    const keepSet = keepByDir.get(dir) ?? /* @__PURE__ */ new Set();
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!keepSet.has(file)) {
        toDelete.push(path.join(dir, file));
      }
    }
  }
  const totalCopyBytes = toCopy.reduce((sum, r) => sum + r.rom.sizeBytes, 0);
  return { toCopy, toDelete, skipped, totalCopyBytes, availableBytes: 0 };
}
async function executeSyncPlan(preview, logDir, onProgress) {
  const errors = [];
  let copiedCount = 0;
  let deletedCount = 0;
  for (let i = 0; i < preview.toCopy.length; i++) {
    const { rom, destination } = preview.toCopy[i];
    onProgress({
      status: "running",
      copiedCount,
      totalCount: preview.toCopy.length,
      currentFile: rom.filename,
      error: null
    });
    try {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(rom.path, destination);
      copiedCount++;
    } catch (e) {
      const msg = `Failed to copy ${rom.filename}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      const logPath2 = writeLog(logDir, copiedCount, 0, preview.skipped.length, errors);
      onProgress({ status: "error", copiedCount, totalCount: preview.toCopy.length, currentFile: rom.filename, error: msg });
      return { copiedCount, deletedCount, skippedCount: preview.skipped.length, errors, logPath: logPath2 };
    }
  }
  for (const filePath of preview.toDelete) {
    try {
      fs.unlinkSync(filePath);
      deletedCount++;
    } catch (e) {
      errors.push(`Failed to delete ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const logPath = writeLog(logDir, copiedCount, deletedCount, preview.skipped.length, errors);
  onProgress({ status: "done", copiedCount, totalCount: preview.toCopy.length, currentFile: "", error: null });
  return { copiedCount, deletedCount, skippedCount: preview.skipped.length, errors, logPath };
}
function writeLog(logDir, copied, deleted, skipped, errors) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `sync-${timestamp}.log`);
  const lines = [
    `ROM Sync Log — ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `copied: ${copied}`,
    `deleted: ${deleted}`,
    `skipped: ${skipped}`,
    errors.length > 0 ? `errors:
${errors.map((e) => `  - ${e}`).join("\n")}` : "errors: none"
  ];
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logPath, lines.join("\n"));
  return logPath;
}
const playlistsDir = () => path.join(electron.app.getPath("userData"), "playlists");
const logsDir = () => path.join(electron.app.getPath("userData"), "logs");
function buildPlaylistMap(dir) {
  const results = loadAllPlaylists(dir);
  const map = {};
  for (const r of results) {
    if (r.playlist) map[r.playlist.stem] = r.playlist;
  }
  return map;
}
function registerIpcHandlers(db2, mainWindow) {
  electron.ipcMain.handle("settings:get", () => getConfig());
  electron.ipcMain.handle("settings:set", (_e, patch) => setConfig(patch));
  electron.ipcMain.handle("library:scan", async () => {
    const { libraryPath } = getConfig();
    await scanLibrary(db2, libraryPath, (progress) => {
      mainWindow.webContents.send("library:scan-progress", progress);
    });
    return { done: true };
  });
  electron.ipcMain.handle(
    "library:roms",
    (_e, platform) => platform ? queryRomsByPlatform(db2, platform) : queryAllRoms(db2)
  );
  electron.ipcMain.handle("playlists:list", () => loadAllPlaylists(playlistsDir()));
  electron.ipcMain.handle("playlists:match", (_e, stem) => {
    const byKey = buildPlaylistMap(playlistsDir());
    const result = resolvePlaylist(stem, byKey);
    if (result.error) return { error: result.error };
    const { fuzzyMatchThreshold } = getConfig();
    return matchEntries(db2, result.entries, fuzzyMatchThreshold);
  });
  electron.ipcMain.handle("devices:list", () => listMountedVolumes());
  electron.ipcMain.handle("devices:read-config", (_e, mountPoint) => readDeviceConfig(mountPoint));
  electron.ipcMain.handle("sync:preview", (_e, mountPoint, playlistStems) => {
    const byKey = buildPlaylistMap(playlistsDir());
    const allEntries = [];
    for (const stem of playlistStems) {
      const result = resolvePlaylist(stem, byKey);
      if (result.error) return { error: result.error };
      allEntries.push(...result.entries);
    }
    const { fuzzyMatchThreshold } = getConfig();
    const matches = matchEntries(db2, allEntries, fuzzyMatchThreshold);
    const { config: deviceConfig, error } = readDeviceConfig(mountPoint);
    if (!deviceConfig) return { error: error ?? "Could not read device config" };
    const preview = computeSyncPreview(matches, deviceConfig, mountPoint);
    const volumes = listMountedVolumes();
    const vol = volumes.find((v) => v.mountPoint === mountPoint);
    if (vol) preview.availableBytes = vol.availableBytes;
    return preview;
  });
  electron.ipcMain.handle("sync:execute", async (_e, mountPoint, playlistStems) => {
    const byKey = buildPlaylistMap(playlistsDir());
    const allEntries = [];
    for (const stem of playlistStems) {
      const result = resolvePlaylist(stem, byKey);
      if (result.error) return { error: result.error };
      allEntries.push(...result.entries);
    }
    const { fuzzyMatchThreshold } = getConfig();
    const matches = matchEntries(db2, allEntries, fuzzyMatchThreshold);
    const { config: deviceConfig, error } = readDeviceConfig(mountPoint);
    if (!deviceConfig) return { error: error ?? "Could not read device config" };
    const preview = computeSyncPreview(matches, deviceConfig, mountPoint);
    return executeSyncPlan(preview, logsDir(), (progress) => {
      mainWindow.webContents.send("sync:progress", progress);
    });
  });
  electron.ipcMain.handle("dialog:open-folder", async () => {
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle("library:cleanup-dotfiles", () => {
    const { libraryPath } = getConfig();
    let removed = 0;
    try {
      const platforms = fs.readdirSync(libraryPath);
      for (const platform of platforms) {
        const dir = path.join(libraryPath, platform);
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (f.startsWith("._") || f === ".DS_Store") {
              try {
                fs.unlinkSync(path.join(dir, f));
                removed++;
              } catch {
              }
            }
          }
        } catch {
        }
      }
    } catch {
    }
    return { removed };
  });
  electron.ipcMain.handle("playlists:open-folder", () => {
    const dir = playlistsDir();
    fs.mkdirSync(dir, { recursive: true });
    electron.shell.openPath(dir);
  });
  electron.ipcMain.handle("playlists:create", (_e, name, platform, rawEntries) => {
    const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entries = rawEntries.split("\n").map((l) => l.trim()).filter(Boolean);
    const lines = [
      `name: ${name}`,
      platform ? `platform: ${platform}` : null,
      "entries:",
      ...entries.map((e) => `  - ${e}`)
    ].filter((l) => l !== null);
    const dir = playlistsDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${stem}.yaml`), lines.join("\n") + "\n");
    return { stem };
  });
  const watcher = chokidar.watch(playlistsDir(), { ignoreInitial: true });
  watcher.on("all", () => {
    mainWindow.webContents.send("playlists:changed");
  });
}
let db;
async function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  db = await openDb();
  registerIpcHandlers(db, win);
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  db?.close();
  electron.app.quit();
});
