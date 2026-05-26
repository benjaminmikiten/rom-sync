import type {
  AppConfig, Rom, ScanProgress, Playlist, ValidationIssue,
  MatchResult, MountedVolume, DeviceConfig, SyncPreview, SyncProgress, SyncResult,
  RescueCopyProgress
} from '@shared/types'

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<AppConfig>
      setSettings: (patch: Partial<AppConfig>) => Promise<AppConfig>
      scanLibrary: () => Promise<{ done: boolean }>
      getRoms: (platform?: string) => Promise<Rom[]>
      onScanProgress: (cb: (p: ScanProgress) => void) => () => void
      listPlaylists: () => Promise<Array<{ valid: boolean; playlist: Playlist | null; issues: ValidationIssue[] }>>
      matchPlaylist: (stem: string) => Promise<MatchResult[]>
      onPlaylistsChanged: (cb: () => void) => () => void
      listDevices: () => Promise<MountedVolume[]>
      readDeviceConfig: (mountPoint: string) => Promise<{ config: DeviceConfig | null; error: string | null }>
      writeDeviceConfig: (mountPoint: string, config: DeviceConfig) => Promise<{ error: string | null }>
      listSubdirs: (path: string) => Promise<string[]>
      previewSync: (mountPoint: string) => Promise<SyncPreview | { error: string }>
      executeSync: (mountPoint: string) => Promise<SyncResult | { error: string }>
      onSyncProgress: (cb: (p: SyncProgress) => void) => () => void
      onRescueCopyProgress: (cb: (p: RescueCopyProgress) => void) => () => void
      openFolderPicker: () => Promise<string | null>
      cleanupDotfiles: () => Promise<{ removed: number }>
      openPlaylistsFolder: () => Promise<void>
      createPlaylist: (name: string, platform: string, rawEntries: string) => Promise<{ stem: string }>
      importPlaylistFromDevice: (mountPoint: string, platform: string, name: string) => Promise<{ stem: string } | { error: string }>
      openPlaylistFile: (filePath: string) => Promise<void>
      copyFromDevice: (pairs: { src: string; dest: string }[]) => Promise<{ copied: number; errors: string[] }>
      addPlaylistEntries: (stem: string, filenames: string[]) => Promise<{ error: string | null }>
      createPlaylistFromFilenames: (name: string, platform: string, filenames: string[]) => Promise<{ stem: string } | { error: string }>
    }
  }
}

export const api = window.api
