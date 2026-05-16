# Import Playlist from Device Folder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a playlist from files already on a configured device folder — protecting those files from being deleted on the next sync.

**Architecture:** A new `playlist-importer.ts` module holds the testable core logic (folder scan → normalize → write YAML). `ipc.ts` registers a thin handler that calls it. The renderer's Devices view adds an inline "Import as playlist" form per platform row.

**Tech Stack:** Node.js `fs`, Vitest, existing `normalizeTitle` + `readDeviceConfig`, React state in `DevicesView`

---

### Task 1: Core logic — `playlist-importer.ts`

**Files:**
- Create: `src/main/playlist-importer.ts`
- Create: `tests/playlist-importer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/playlist-importer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { importPlaylistFromDeviceFolder } from '../src/main/playlist-importer'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let mountPoint: string
let playlistsDir: string

beforeEach(() => {
  mountPoint = mkdtempSync(join(tmpdir(), 'device-'))
  playlistsDir = mkdtempSync(join(tmpdir(), 'playlists-'))
  writeFileSync(join(mountPoint, 'rom-sync.yaml'), [
    'device_name: Test Device',
    'platforms:',
    '  nds: /ROMS/DS'
  ].join('\n'))
  mkdirSync(join(mountPoint, 'ROMS', 'DS'), { recursive: true })
})

afterEach(() => {
  rmSync(mountPoint, { recursive: true })
  rmSync(playlistsDir, { recursive: true })
})

describe('importPlaylistFromDeviceFolder', () => {
  it('creates a playlist YAML from files in the mapped folder', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Castlevania - Dawn of Sorrow (USA).nds'), 'dummy')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Mario Kart DS (USA).nds'), 'dummy')

    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect(result).toEqual({ stem: 'ds-games' })

    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    expect(yaml).toContain('name: DS Games')
    expect(yaml).toContain('platform: nds')
    expect(yaml).toContain('  - castlevania dawn of sorrow')
    expect(yaml).toContain('  - mario kart ds')
  })

  it('returns error when name is empty', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', '', playlistsDir)
    expect(result).toEqual({ error: 'Name is required' })
  })

  it('returns error when name is only whitespace', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', '   ', playlistsDir)
    expect(result).toEqual({ error: 'Name is required' })
  })

  it('returns error when device config is missing', () => {
    const emptyMount = mkdtempSync(join(tmpdir(), 'empty-'))
    try {
      const result = importPlaylistFromDeviceFolder(emptyMount, 'nds', 'DS Games', playlistsDir)
      expect('error' in result).toBe(true)
    } finally {
      rmSync(emptyMount, { recursive: true })
    }
  })

  it('returns error when platform is not in device config', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'gba', 'GBA Games', playlistsDir)
    expect(result).toEqual({ error: "Platform 'gba' not found in device config" })
  })

  it('returns error when folder does not exist', () => {
    rmSync(join(mountPoint, 'ROMS', 'DS'), { recursive: true })
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toContain('Could not read folder')
  })

  it('returns error on stem collision', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game.nds'), 'dummy')
    writeFileSync(join(playlistsDir, 'ds-games.yaml'), 'existing')

    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect(result).toEqual({ error: 'A playlist with that name already exists' })
  })

  it('deduplicates normalized titles', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game (USA).nds'), 'dummy')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game (Europe).nds'), 'dummy')

    importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    const entryLines = yaml.split('\n').filter((l) => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })

  it('skips hidden files and .txt files', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', '.DS_Store'), 'hidden')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'readme.txt'), 'text')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game.nds'), 'dummy')

    importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    const entryLines = yaml.split('\n').filter((l) => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/playlist-importer.test.ts
```

Expected: all tests fail with `Cannot find module '../src/main/playlist-importer'`

- [ ] **Step 3: Implement `playlist-importer.ts`**

Create `src/main/playlist-importer.ts`:

```ts
import { existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readDeviceConfig } from './device-detector'
import { normalizeTitle } from './normalizer'

export function importPlaylistFromDeviceFolder(
  mountPoint: string,
  platform: string,
  name: string,
  playlistsDir: string
): { stem: string } | { error: string } {
  const trimmedName = name.trim()
  if (!trimmedName) return { error: 'Name is required' }

  const { config, error } = readDeviceConfig(mountPoint)
  if (!config) return { error: error ?? 'Could not read device config' }

  const platformPath = config.platforms[platform]
  if (!platformPath) return { error: `Platform '${platform}' not found in device config` }

  const folderPath = join(mountPoint, platformPath)
  let files: string[]
  try {
    files = readdirSync(folderPath).filter((f) => {
      if (f.startsWith('.') || f.toLowerCase().endsWith('.txt')) return false
      try {
        return statSync(join(folderPath, f)).isFile()
      } catch {
        return false
      }
    })
  } catch {
    return { error: `Could not read folder: ${platformPath}` }
  }

  const seen = new Set<string>()
  const entries: string[] = []
  for (const filename of files) {
    const title = normalizeTitle(filename)
    if (!seen.has(title)) {
      seen.add(title)
      entries.push(title)
    }
  }

  const stem = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const yamlPath = join(playlistsDir, `${stem}.yaml`)
  if (existsSync(yamlPath)) {
    return { error: 'A playlist with that name already exists' }
  }

  const lines = [
    `name: ${trimmedName}`,
    `platform: ${platform}`,
    'entries:',
    ...entries.map((e) => `  - ${e}`)
  ]
  writeFileSync(yamlPath, lines.join('\n') + '\n')

  return { stem }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/playlist-importer.test.ts
```

Expected: all 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/playlist-importer.ts tests/playlist-importer.test.ts
git commit -m "feat: add importPlaylistFromDeviceFolder core logic"
```

---

### Task 2: Wire IPC handler in `ipc.ts`

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Add the import at the top of `src/main/ipc.ts`**

Add to the existing imports (after the `sync-executor` import):

```ts
import { importPlaylistFromDeviceFolder } from './playlist-importer'
```

- [ ] **Step 2: Register the handler inside `registerIpcHandlers`**

Add after the `playlists:create` handler (around line 161):

```ts
ipcMain.handle('playlists:import-from-device', (_e, mountPoint: string, platform: string, name: string) =>
  importPlaylistFromDeviceFolder(mountPoint, platform, name, playlistsDir())
)
```

- [ ] **Step 3: Run the full test suite to confirm nothing is broken**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: register playlists:import-from-device IPC handler"
```

---

### Task 3: Preload + API type declaration

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api.ts`

- [ ] **Step 1: Expose the call in `src/preload/index.ts`**

Add after the `createPlaylist` line in the `contextBridge.exposeInMainWorld('api', { ... })` block:

```ts
importPlaylistFromDevice: (mountPoint: string, platform: string, name: string) =>
  ipcRenderer.invoke('playlists:import-from-device', mountPoint, platform, name),
```

- [ ] **Step 2: Add the type declaration in `src/renderer/src/api.ts`**

Add after the `createPlaylist` line inside the `Window['api']` interface:

```ts
importPlaylistFromDevice: (mountPoint: string, platform: string, name: string) => Promise<{ stem: string } | { error: string }>
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat: expose importPlaylistFromDevice in preload and API types"
```

---

### Task 4: Devices view UI

**Files:**
- Modify: `src/renderer/src/views/DevicesView.tsx`

- [ ] **Step 1: Add import form state**

In `DevicesView`, add these state declarations after the existing `playlistSaveError` state (around line 36):

```ts
const [importPlatform, setImportPlatform] = useState<string | null>(null)
const [importName, setImportName] = useState('')
const [importResult, setImportResult] = useState<{ stem: string } | { error: string } | null>(null)
const [importing, setImporting] = useState(false)
```

- [ ] **Step 2: Reset import state when opening a different platform's form**

Add this handler after `handleTogglePlaylist`:

```ts
function handleOpenImport(platform: string): void {
  setImportPlatform(platform)
  setImportName(platform.toUpperCase())
  setImportResult(null)
}
```

- [ ] **Step 3: Add the import submit handler**

Add after `handleOpenImport`:

```ts
async function handleImport(): Promise<void> {
  if (!selected?.config || !importPlatform || !importName.trim()) return
  setImporting(true)
  setImportResult(null)
  const result = await api.importPlaylistFromDevice(
    selected.volume.mountPoint,
    importPlatform,
    importName
  )
  setImportResult(result)
  setImporting(false)
}
```

- [ ] **Step 4: Add the import form to the platform mappings table**

In the `selected.config` section, find the platform mappings table (`<table>` around line 284). Replace it with:

```tsx
<h3>Platform Mappings</h3>
<table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
  <thead>
    <tr style={{ color: '#888', textAlign: 'left' }}>
      <th style={{ padding: '4px 16px 4px 0' }}>Platform</th>
      <th style={{ padding: '4px 16px 4px 0' }}>Path on Card</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {Object.entries(selected.config.platforms).map(([platform, path]) => (
      <React.Fragment key={platform}>
        <tr>
          <td style={{ padding: '4px 16px 4px 0', fontWeight: 600 }}>{platform}</td>
          <td style={{ padding: '4px 16px 4px 0', color: '#aaa' }}>{path}</td>
          <td>
            <button
              onClick={() =>
                importPlatform === platform
                  ? setImportPlatform(null)
                  : handleOpenImport(platform)
              }
              style={{ padding: '3px 10px', background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              {importPlatform === platform ? 'Cancel' : 'Import as playlist'}
            </button>
          </td>
        </tr>
        {importPlatform === platform && (
          <tr>
            <td colSpan={3} style={{ paddingBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Playlist name"
                  style={{ padding: '6px 8px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, fontSize: 13, width: 200 }}
                />
                <button
                  onClick={handleImport}
                  disabled={importing || !importName.trim()}
                  style={{
                    padding: '6px 14px',
                    background: importing || !importName.trim() ? '#2a2a2a' : '#4a9eff',
                    color: importing || !importName.trim() ? '#555' : '#fff',
                    border: 'none', borderRadius: 4,
                    cursor: importing || !importName.trim() ? 'default' : 'pointer',
                    fontSize: 13
                  }}
                >
                  {importing ? 'Creating…' : 'Create'}
                </button>
              </div>
              {importResult && 'error' in importResult && (
                <div style={{ color: '#f44336', fontSize: 12, marginTop: 6 }}>{importResult.error}</div>
              )}
              {importResult && 'stem' in importResult && (
                <div style={{ color: '#4caf50', fontSize: 12, marginTop: 6 }}>
                  Playlist &lsquo;{importResult.stem}&rsquo; created — assign it to this device in the Playlists section below.
                </div>
              )}
            </td>
          </tr>
        )}
      </React.Fragment>
    ))}
  </tbody>
</table>
```

- [ ] **Step 5: Build and manually test the feature**

```bash
npm run dev
```

1. Open the app and navigate to **Devices**
2. Select a configured device (one with a valid `rom-sync.yaml`)
3. In the Platform Mappings table, click **Import as playlist** next to a platform
4. Confirm the name input pre-fills with the platform code uppercased
5. Change the name to something custom and click **Create**
6. Confirm the success message appears inline and the form stays open
7. Navigate to **Playlists** — the new playlist should appear with the correct name, platform, and entries
8. Return to Devices, open the same platform's form, re-enter the same name and click **Create** — confirm the collision error appears
9. Click **Cancel** (the toggled "Import as playlist" button) — confirm the form collapses

- [ ] **Step 6: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/DevicesView.tsx
git commit -m "feat: add import-as-playlist form to device platform rows"
```
