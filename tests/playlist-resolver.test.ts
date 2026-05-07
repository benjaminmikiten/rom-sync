import { describe, it, expect } from 'vitest'
import { resolvePlaylist, detectCircularIncludes } from '../src/main/playlist-resolver'
import type { Playlist } from '../src/shared/types'

function makePlaylist(stem: string, entries: string[], platform: string, includes: string[] = []): Playlist {
  return {
    stem,
    name: stem,
    platform,
    entries: entries.map((raw) => ({ raw, platform })),
    includes,
    filePath: `/playlists/${stem}.yaml`
  }
}

const playlists: Record<string, Playlist> = {
  'base': makePlaylist('base', ['Game A', 'Game B'], 'gba'),
  'extras': makePlaylist('extras', ['Game C'], 'gba'),
  'combined': makePlaylist('combined', ['Game D'], 'gba', ['base', 'extras']),
  'nested': makePlaylist('nested', ['Game E'], 'gba', ['combined'])
}

describe('resolvePlaylist', () => {
  it('returns own entries when no includes', () => {
    const result = resolvePlaylist('base', playlists)
    expect(result.entries.map((e) => e.raw)).toEqual(['Game A', 'Game B'])
    expect(result.error).toBeNull()
  })

  it('merges included playlist entries', () => {
    const result = resolvePlaylist('combined', playlists)
    const raws = result.entries.map((e) => e.raw)
    expect(raws).toContain('Game D')
    expect(raws).toContain('Game A')
    expect(raws).toContain('Game B')
    expect(raws).toContain('Game C')
  })

  it('resolves nested includes recursively', () => {
    const result = resolvePlaylist('nested', playlists)
    const raws = result.entries.map((e) => e.raw)
    expect(raws).toContain('Game E')
    expect(raws).toContain('Game D')
    expect(raws).toContain('Game A')
  })

  it('reports missing includes as error', () => {
    const withMissing = makePlaylist('miss', [], 'gba', ['nonexistent'])
    const result = resolvePlaylist('miss', { miss: withMissing })
    expect(result.error).toMatch(/nonexistent/)
  })
})

describe('detectCircularIncludes', () => {
  it('detects direct cycle', () => {
    const a = makePlaylist('a', [], 'gba', ['b'])
    const b = makePlaylist('b', [], 'gba', ['a'])
    const error = detectCircularIncludes('a', { a, b })
    expect(error).toMatch(/circular/i)
  })

  it('returns null when no cycle', () => {
    expect(detectCircularIncludes('combined', playlists)).toBeNull()
  })
})
