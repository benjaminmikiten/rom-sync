import { readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import yaml from 'js-yaml'
import type { Playlist, PlaylistEntry, ValidationIssue } from '@shared/types'

interface LoadResult {
  valid: boolean
  playlist: Playlist | null
  issues: ValidationIssue[]
}

export function loadPlaylist(filePath: string): LoadResult {
  const stem = basename(filePath, '.yaml')
  const issues: ValidationIssue[] = []
  let raw: unknown

  try {
    raw = yaml.load(readFileSync(filePath, 'utf-8'))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { valid: false, playlist: null, issues: [{ severity: 'error', message: `YAML parse error: ${msg}` }] }
  }

  if (!raw || typeof raw !== 'object') {
    return { valid: false, playlist: null, issues: [{ severity: 'error', message: 'Playlist file is empty or not an object' }] }
  }

  const doc = raw as Record<string, unknown>

  if (!doc['name'] || typeof doc['name'] !== 'string') {
    issues.push({ severity: 'error', message: 'Missing required field: name' })
  }

  // Parse platform: accepts a string ('snes') or YAML list (['snes', 'sfc'])
  const rawPlatform = doc['platform']
  const parsedPlatforms: string[] | null =
    typeof rawPlatform === 'string' ? [rawPlatform] :
    Array.isArray(rawPlatform) ? (rawPlatform as unknown[]).filter((x): x is string => typeof x === 'string') :
    null
  // Treat empty array same as absent (cross-platform)
  const platforms = parsedPlatforms && parsedPlatforms.length > 0 ? parsedPlatforms : null
  const includesRaw = Array.isArray(doc['includes'])
    ? (doc['includes'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const entries: PlaylistEntry[] = []

  if (platforms) {
    // single-platform or alias: entries is a flat string list, expanded per platform
    if (!Array.isArray(doc['entries'])) {
      issues.push({ severity: 'error', message: 'entries must be a list for single-platform playlists' })
    } else {
      for (const platformCode of platforms) {
        for (const e of doc['entries'] as unknown[]) {
          if (typeof e === 'string') entries.push({ raw: e, platform: platformCode })
        }
      }
    }
  } else {
    // cross-platform: entries is either a platform-keyed map or a list of { raw, platform } objects
    if (doc['entries'] && typeof doc['entries'] === 'object' && !Array.isArray(doc['entries'])) {
      // platform-keyed map: { gba: ['Game A', ...], snes: [...] }
      for (const [platform, list] of Object.entries(doc['entries'] as Record<string, unknown>)) {
        if (Array.isArray(list)) {
          for (const e of list) {
            if (typeof e === 'string') entries.push({ raw: e, platform })
          }
        }
      }
    } else if (Array.isArray(doc['entries'])) {
      // per-entry object list: [{ raw: 'Game A', platform: 'gba' }, ...]
      for (const e of doc['entries'] as unknown[]) {
        if (e && typeof e === 'object' && !Array.isArray(e)) {
          const obj = e as Record<string, unknown>
          if (typeof obj['raw'] === 'string' && typeof obj['platform'] === 'string') {
            entries.push({ raw: obj['raw'], platform: obj['platform'] })
          }
        }
      }
    } else if (doc['entries'] !== undefined) {
      issues.push({ severity: 'error', message: 'entries must be a platform-keyed map or a list of { raw, platform } objects for cross-platform playlists' })
    }
  }

  if (issues.some((i) => i.severity === 'error')) {
    return { valid: false, playlist: null, issues }
  }

  return {
    valid: true,
    issues,
    playlist: {
      stem,
      name: doc['name'] as string,
      platform: platforms,
      entries,
      includes: includesRaw,
      filePath
    }
  }
}

export function loadAllPlaylists(playlistsDir: string): LoadResult[] {
  let files: string[]
  try {
    files = readdirSync(playlistsDir).filter((f) => f.endsWith('.yaml'))
  } catch {
    return []
  }
  return files.map((f) => loadPlaylist(join(playlistsDir, f)))
}
