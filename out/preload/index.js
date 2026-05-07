"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Settings
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => electron.ipcRenderer.invoke("settings:set", patch),
  // Library
  scanLibrary: () => electron.ipcRenderer.invoke("library:scan"),
  getRoms: (platform) => electron.ipcRenderer.invoke("library:roms", platform),
  onScanProgress: (cb) => {
    electron.ipcRenderer.on("library:scan-progress", (_e, p) => cb(p));
    return () => electron.ipcRenderer.removeAllListeners("library:scan-progress");
  },
  // Playlists
  listPlaylists: () => electron.ipcRenderer.invoke("playlists:list"),
  matchPlaylist: (stem) => electron.ipcRenderer.invoke("playlists:match", stem),
  onPlaylistsChanged: (cb) => {
    electron.ipcRenderer.on("playlists:changed", cb);
    return () => electron.ipcRenderer.removeAllListeners("playlists:changed");
  },
  // Devices
  listDevices: () => electron.ipcRenderer.invoke("devices:list"),
  readDeviceConfig: (mountPoint) => electron.ipcRenderer.invoke("devices:read-config", mountPoint),
  // Utilities
  openFolderPicker: () => electron.ipcRenderer.invoke("dialog:open-folder"),
  cleanupDotfiles: () => electron.ipcRenderer.invoke("library:cleanup-dotfiles"),
  openPlaylistsFolder: () => electron.ipcRenderer.invoke("playlists:open-folder"),
  createPlaylist: (name, platform, rawEntries) => electron.ipcRenderer.invoke("playlists:create", name, platform, rawEntries),
  // Sync
  previewSync: (mountPoint, stems) => electron.ipcRenderer.invoke("sync:preview", mountPoint, stems),
  executeSync: (mountPoint, stems) => electron.ipcRenderer.invoke("sync:execute", mountPoint, stems),
  onSyncProgress: (cb) => {
    electron.ipcRenderer.on("sync:progress", (_e, p) => cb(p));
    return () => electron.ipcRenderer.removeAllListeners("sync:progress");
  }
});
