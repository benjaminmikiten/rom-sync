import { ipcMain, app } from 'electron'
import { join } from 'path'
import type { Database } from './db'
import { getConfig, setConfig } from './config'
import { scanLibrary } from './scanner'
import { loadAllPlaylists } from './playlist-loader'
import { resolvePlaylist } from './playlist-resolver'
import { matchEntries } from './matcher'
import { listMountedVolumes, readDeviceConfig } from './device-detector'
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
    const { entries } = resolvePlaylist(stem, byKey)
    const { fuzzyMatchThreshold } = getConfig()
    return matchEntries(db, entries, fuzzyMatchThreshold)
  })

  // Devices
  ipcMain.handle('devices:list', () => listMountedVolumes())
  ipcMain.handle('devices:read-config', (_e, mountPoint: string) => readDeviceConfig(mountPoint))

  // Sync
  ipcMain.handle('sync:preview', (_e, mountPoint: string, playlistStems: string[]) => {
    const byKey = buildPlaylistMap(playlistsDir())
    const allEntries = playlistStems.flatMap((stem) => resolvePlaylist(stem, byKey).entries)
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
    const allEntries = playlistStems.flatMap((stem) => resolvePlaylist(stem, byKey).entries)
    const { fuzzyMatchThreshold } = getConfig()
    const matches: MatchResult[] = matchEntries(db, allEntries, fuzzyMatchThreshold)

    const { config: deviceConfig, error } = readDeviceConfig(mountPoint)
    if (!deviceConfig) return { error: error ?? 'Could not read device config' }

    const preview = computeSyncPreview(matches, deviceConfig, mountPoint)

    return executeSyncPlan(preview, logsDir(), (progress) => {
      mainWindow.webContents.send('sync:progress', progress)
    })
  })

  // Watch playlists dir for changes
  const watcher = watch(playlistsDir(), { ignoreInitial: true })
  watcher.on('all', () => {
    mainWindow.webContents.send('playlists:changed')
  })
}
