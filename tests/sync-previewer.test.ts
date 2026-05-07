// tests/sync-previewer.test.ts
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
  platforms: { gba: '/games/gba', snes: '/games/snes' }
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

  it('adds extra files on card to toDelete', () => {
    writeFileSync(join(cardDir, 'games', 'gba', 'Orphan.zip'), 'data')
    const preview = computeSyncPreview([], deviceConfig, cardDir)
    expect(preview.toDelete.some((p) => p.endsWith('Orphan.zip'))).toBe(true)
  })

  it('does not include file in toDelete if it is in the playlist', () => {
    writeFileSync(join(cardDir, 'games', 'gba', 'Game.zip'), 'data')
    const matches = [exactMatch(rom(1, 'gba', 'Game.zip'))]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.toDelete).toHaveLength(0)
  })

  it('adds unmatched entries to skipped', () => {
    const matches = [noMatch()]
    const preview = computeSyncPreview(matches, deviceConfig, cardDir)
    expect(preview.skipped).toHaveLength(1)
  })

  it('sums totalCopyBytes from toCopy ROMs', () => {
    const r = rom(1, 'gba', 'Game.zip')
    const preview = computeSyncPreview([exactMatch(r)], deviceConfig, cardDir)
    expect(preview.totalCopyBytes).toBe(1000)
  })
})
