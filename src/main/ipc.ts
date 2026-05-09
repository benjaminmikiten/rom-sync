import { ipcMain, app, dialog, shell } from 'electron'
import { join } from 'path'
import { readdirSync, unlinkSync, writeFileSync, mkdirSync } from 'fs'
import type { Database } from './db'
import { getConfig, setConfig } from './config'
import { scanLibrary } from './scanner'
import { loadAllPlaylists } from './playlist-loader'
import { resolvePlaylist } from './playlist-resolver'
import { matchEntries } from './matcher'
import { listMountedVolumes, readDeviceConfig, writeDeviceConfig } from './device-detector'
import { computeSyncPreview } from './sync-previewer'
import { executeSyncPlan } from './sync-executor'
import { queryRomsByPlatform, queryAllRoms } from './db'
import type { AppConfig, Playlist, MatchResult } from '@shared/types'
import { watch } from 'chokidar'
import type { BrowserWindow } from 'electron'

const playlistsDir = (): string => join(app.getPath('userData'), 'playlists')
const logsDir = (): string => join(app.getPath('userData'), 'logs')

function buildPlaylistMap(dir: string): Record<string, Playlist> {
  const results = loadAllPlaylists(dir)
  const map: Record<string, Playlist> = {}
  for (const r of results) {
    if (r.playlist) map[r.playlist.stem] = r.playlist
  }
  return map
}

export function registerIpcHandlers(db: Database, mainWindow: BrowserWindow): void {
  // Settings
  ipcMain.handle('settings:get', () => getConfig())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppConfig>) => setConfig(patch))

  // Library
  ipcMain.handle('library:scan', async () => {
    const { libraryPath } = getConfig()
    await scanLibrary(db, libraryPath, (progress) => {
      mainWindow.webContents.send('library:scan-progress', progress)
    })
    return { done: true }
  })

  ipcMain.handle('library:roms', (_e, platform?: string) =>
    platform ? queryRomsByPlatform(db, platform) : queryAllRoms(db)
  )

  // Playlists
  ipcMain.handle('playlists:list', () => loadAllPlaylists(playlistsDir()))

  ipcMain.handle('playlists:match', (_e, stem: string) => {
    const byKey = buildPlaylistMap(playlistsDir())
    const result = resolvePlaylist(stem, byKey)
    if (result.error) return { error: result.error }
    const { fuzzyMatchThreshold } = getConfig()
    return matchEntries(db, result.entries, fuzzyMatchThreshold)
  })

  // Devices
  ipcMain.handle('devices:list', () => listMountedVolumes())
  ipcMain.handle('devices:read-config', (_e, mountPoint: string) => readDeviceConfig(mountPoint))
  ipcMain.handle('devices:write-config', (_e, mountPoint: string, config: import('@shared/types').DeviceConfig) =>
    writeDeviceConfig(mountPoint, config)
  )

  // Sync
  ipcMain.handle('sync:preview', (_e, mountPoint: string, playlistStems: string[]) => {
    const byKey = buildPlaylistMap(playlistsDir())
    const allEntries: import('@shared/types').PlaylistEntry[] = []
    for (const stem of playlistStems) {
      const result = resolvePlaylist(stem, byKey)
      if (result.error) return { error: result.error }
      allEntries.push(...result.entries)
    }
    const { fuzzyMatchThreshold } = getConfig()
    const matches: MatchResult[] = matchEntries(db, allEntries, fuzzyMatchThreshold)

    const { config: deviceConfig, error } = readDeviceConfig(mountPoint)
    if (!deviceConfig) return { error: error ?? 'Could not read device config' }

    const preview = computeSyncPreview(matches, deviceConfig, mountPoint)

    const volumes = listMountedVolumes()
    const vol = volumes.find((v) => v.mountPoint === mountPoint)
    if (vol) preview.availableBytes = vol.availableBytes

    return preview
  })

  ipcMain.handle('sync:execute', async (_e, mountPoint: string, playlistStems: string[]) => {
    const byKey = buildPlaylistMap(playlistsDir())
    const allEntries: import('@shared/types').PlaylistEntry[] = []
    for (const stem of playlistStems) {
      const result = resolvePlaylist(stem, byKey)
      if (result.error) return { error: result.error }
      allEntries.push(...result.entries)
    }
    const { fuzzyMatchThreshold } = getConfig()
    const matches: MatchResult[] = matchEntries(db, allEntries, fuzzyMatchThreshold)

    const { config: deviceConfig, error } = readDeviceConfig(mountPoint)
    if (!deviceConfig) return { error: error ?? 'Could not read device config' }

    const preview = computeSyncPreview(matches, deviceConfig, mountPoint)

    return executeSyncPlan(preview, logsDir(), (progress) => {
      mainWindow.webContents.send('sync:progress', progress)
    })
  })

  // Utilities
  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('library:cleanup-dotfiles', () => {
    const { libraryPath } = getConfig()
    let removed = 0
    try {
      const platforms = readdirSync(libraryPath)
      for (const platform of platforms) {
        const dir = join(libraryPath, platform)
        try {
          const files = readdirSync(dir)
          for (const f of files) {
            if (f.startsWith('._') || f === '.DS_Store') {
              try { unlinkSync(join(dir, f)); removed++ } catch { /* skip */ }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
    } catch { /* libraryPath not set/readable */ }
    return { removed }
  })

  ipcMain.handle('playlists:open-folder', () => {
    const dir = playlistsDir()
    mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
  })

  ipcMain.handle('playlists:create', (_e, name: string, platform: string, rawEntries: string) => {
    const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const entries = rawEntries.split('\n').map((l) => l.trim()).filter(Boolean)
    const lines = [
      `name: ${name}`,
      platform ? `platform: ${platform}` : null,
      'entries:',
      ...entries.map((e) => `  - ${e}`),
    ].filter((l): l is string => l !== null)
    const dir = playlistsDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${stem}.yaml`), lines.join('\n') + '\n')
    return { stem }
  })

  // Watch playlists dir for changes
  const watcher = watch(playlistsDir(), { ignoreInitial: true })
  watcher.on('all', () => {
    mainWindow.webContents.send('playlists:changed')
  })
}
