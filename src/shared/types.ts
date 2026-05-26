// --- Config ---
export interface AppConfig {
  libraryPath: string
  fuzzyMatchThreshold: number
}

// --- ROM Library ---
export interface Rom {
  id: number
  platform: string
  title: string        // normalized title
  filename: string
  path: string
  sizeBytes: number
  scannedAt: number    // unix timestamp
}

export interface ScanProgress {
  current: number
  total: number | null
  currentFile: string
}

// --- Playlists ---
export interface PlaylistEntry {
  raw: string          // original string from YAML
  platform: string | string[]  // single platform code or list of platform codes to search
}

export interface Playlist {
  stem: string
  name: string
  platform: string[] | null   // null = cross-platform; array = one or more platform codes
  entries: PlaylistEntry[]
  includes: string[]           // stems of other playlists
  filePath: string
}

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: ValidationSeverity
  message: string
  line?: number
}

export interface PlaylistValidation {
  stem: string
  valid: boolean
  issues: ValidationIssue[]
}

// --- Matching ---
export type MatchStatus = 'exact' | 'fuzzy' | 'none'

export interface MatchResult {
  entry: PlaylistEntry
  status: MatchStatus
  rom: Rom | null          // null when status === 'none'
  score: number | null     // fuse score when fuzzy
}

export type SkipReason = 'no-match' | 'platform-not-mapped'

export interface SkippedEntry {
  match: MatchResult
  reason: SkipReason
}

// --- Devices ---
export interface DeviceConfig {
  deviceName: string
  platforms: Record<string, string>  // platform -> path on card
  playlists: string[]                // playlist stems assigned to this device
}

export interface MountedVolume {
  name: string
  mountPoint: string
  availableBytes: number
  totalBytes: number
}

// --- Sync ---
export interface SyncPreview {
  toCopy: ResolvedRom[]
  toDelete: { platform: string; path: string }[]   // absolute paths on SD card with platform
  skipped: SkippedEntry[]
  totalCopyBytes: number
  availableBytes: number
}

export interface ResolvedRom {
  rom: Rom
  destination: string        // absolute path on SD card
}

export type SyncStatus = 'idle' | 'running' | 'done' | 'error'

export interface SyncProgress {
  status: SyncStatus
  copiedCount: number
  totalCount: number
  currentFile: string
  error: string | null
}

export interface SyncResult {
  copiedCount: number
  deletedCount: number
  skippedCount: number
  errors: string[]
  logPath: string
}

export interface RescueCopyProgress {
  copied: number
  total: number
  currentFile: string
}
