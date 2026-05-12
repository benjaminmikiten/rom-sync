import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: object) => ipcRenderer.invoke('settings:set', patch),

  // Library
  scanLibrary: () => ipcRenderer.invoke('library:scan'),
  getRoms: (platform?: string) => ipcRenderer.invoke('library:roms', platform),
  onScanProgress: (cb: (p: unknown) => void) => {
    ipcRenderer.on('library:scan-progress', (_e, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('library:scan-progress')
  },

  // Playlists
  listPlaylists: () => ipcRenderer.invoke('playlists:list'),
  matchPlaylist: (stem: string) => ipcRenderer.invoke('playlists:match', stem),
  onPlaylistsChanged: (cb: () => void) => {
    ipcRenderer.on('playlists:changed', cb)
    return () => ipcRenderer.removeAllListeners('playlists:changed')
  },

  // Devices
  listDevices: () => ipcRenderer.invoke('devices:list'),
  readDeviceConfig: (mountPoint: string) => ipcRenderer.invoke('devices:read-config', mountPoint),
  writeDeviceConfig: (mountPoint: string, config: import('@shared/types').DeviceConfig) =>
    ipcRenderer.invoke('devices:write-config', mountPoint, config),
  listSubdirs: (path: string): Promise<string[]> => ipcRenderer.invoke('devices:list-subdirs', path),

  // Utilities
  openFolderPicker: () => ipcRenderer.invoke('dialog:open-folder'),
  cleanupDotfiles: () => ipcRenderer.invoke('library:cleanup-dotfiles'),
  openPlaylistsFolder: () => ipcRenderer.invoke('playlists:open-folder'),
  createPlaylist: (name: string, platform: string, rawEntries: string) =>
    ipcRenderer.invoke('playlists:create', name, platform, rawEntries),

  // Sync
  previewSync: (mountPoint: string, stems: string[]) => ipcRenderer.invoke('sync:preview', mountPoint, stems),
  executeSync: (mountPoint: string, stems: string[]) => ipcRenderer.invoke('sync:execute', mountPoint, stems),
  onSyncProgress: (cb: (p: unknown) => void) => {
    ipcRenderer.on('sync:progress', (_e, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('sync:progress')
  }
})
