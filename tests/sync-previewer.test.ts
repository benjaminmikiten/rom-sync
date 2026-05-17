import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { computeSyncPreview } from '../src/main/sync-previewer'
import type { MatchResult, DeviceConfig, Rom } from '../src/shared/types'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let cardDir: string

beforeEach(() => {
  cardDir = mkdtempSync(join(tmpdir(), 'card-test-'))
  mkdirSync(join(cardDir, 'games', 'gba'), { recursive: true })
  mkdirSync(join(cardDir, 'games', 'snes'), { recursive: true })
})

afterEach(() => rmSync(cardDir, { recursive: true }))

const rom = (id: number, platform: string, filename: string): Rom => ({
  id, platform, title: filename.toLowerCase(), filename,
  path: `/library/${platform}/${filename}`, sizeBytes: 1000, scannedAt: 0
})

const exactMatch = (r: Rom): MatchResult => ({
  entry: { raw: r.title, platform: r.platform }, status: 'exact', rom: r, score: null
})
const noMatch = (): MatchResult => ({
  entry: { raw: 'Unknown Game', platform: 'gba' }, status: 'none', rom: null, score: null
})

const deviceConfig: DeviceConfig = {
  deviceName: 'Test Card',
  platforms: { gba: '/games/gba', snes: '/games/snes' },
  playlists: []
}

describe('computeSyncPreview', () => {
  it('adds matched ROMs not on card to toCopy', () => {
    const matches = [exactMatch(rom(1, 'gba', 'Game.zip'))]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.toCopy).toHaveLength(1)
    expect(preview.toCopy[0].destination).toBe(join(cardDir, 'games', 'gba', 'Game.zip'))
  })

  it('omits ROM already present on card from toCopy', () => {
    writeFileSync(join(cardDir, 'games', 'gba', 'Game.zip'), 'data')
    const matches = [exactMatch(rom(1, 'gba', 'Game.zip'))]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.toCopy).toHaveLength(0)
  })

  it('adds extra files on card to toDelete with their platform', () => {
    writeFileSync(join(cardDir, 'games', 'gba', 'Orphan.zip'), 'data')
    const preview = computeSyncPreview([], deviceConfig, cardDir)
    expect(preview.toDelete).toHaveLength(1)
    expect(preview.toDelete[0].platform).toBe('gba')
    expect(preview.toDelete[0].path).toBe(join(cardDir, 'games', 'gba', 'Orphan.zip'))
  })

  it('does not include file in toDelete if it is in the playlist', () => {
    writeFileSync(join(cardDir, 'games', 'gba', 'Game.zip'), 'data')
    const matches = [exactMatch(rom(1, 'gba', 'Game.zip'))]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.toDelete).toHaveLength(0)
  })

  it('marks unmatched entries as skipped with reason no-match', () => {
    const matches = [noMatch()]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.skipped).toHaveLength(1)
    expect(preview.skipped[0].reason).toBe('no-match')
    expect(preview.skipped[0].match.entry.raw).toBe('Unknown Game')
  })

  it('marks matched ROM on unmapped platform as skipped with reason platform-not-mapped', () => {
    // n64 is not in deviceConfig.platforms
    const n64Rom = rom(2, 'n64', 'Mario64.z64')
    const matches = [exactMatch(n64Rom)]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.skipped).toHaveLength(1)
    expect(preview.skipped[0].reason).toBe('platform-not-mapped')
    expect(preview.skipped[0].match.rom?.platform).toBe('n64')
  })

  it('sums totalCopyBytes from toCopy ROMs', () => {
    const r = rom(1, 'gba', 'Game.zip')
    const preview = computeSyncPreview([exactMatch(r)], deviceConfig, cardDir)
    expect(preview.totalCopyBytes).toBe(1000)
  })
})
