import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadPlaylist, loadAllPlaylists } from '../src/main/playlist-loader'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pl-test-')) })
afterEach(() => rmSync(dir, { recursive: true }))

function write(name: string, content: string): string {
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('loadPlaylist — single-platform', () => {
  it('parses name, platform, and entries', () => {
    const path = write('gba-best.yaml', `
name: GBA Best
platform: gba
entries:
  - Castlevania - Aria of Sorrow (USA)
  - Metroid Fusion (USA)
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.name).toBe('GBA Best')
    expect(result.playlist!.platform).toEqual(['gba'])
    expect(result.playlist!.entries).toHaveLength(2)
    expect(result.playlist!.entries[0].platform).toBe('gba')
    expect(result.playlist!.entries[0].raw).toBe('Castlevania - Aria of Sorrow (USA)')
  })
})

describe('loadPlaylist — cross-platform', () => {
  it('parses platform-keyed entries', () => {
    const path = write('pokemon.yaml', `
name: Pokemon Collection
entries:
  gb:
    - Pokemon Red (USA)
  gba:
    - Pokemon FireRed (USA)
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toBeNull()
    expect(result.playlist!.entries).toHaveLength(2)
    const platforms = result.playlist!.entries.map((e) => e.platform)
    expect(platforms).toContain('gb')
    expect(platforms).toContain('gba')
  })

  it('parses per-entry { raw, platform } object list', () => {
    const path = write('mixed.yaml', `
name: Mixed Collection
entries:
  - raw: Pokemon Red
    platform: gb
  - raw: Pokemon FireRed
    platform: gba
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toBeNull()
    expect(result.playlist!.entries).toHaveLength(2)
    expect(result.playlist!.entries[0]).toEqual({ raw: 'Pokemon Red', platform: 'gb' })
    expect(result.playlist!.entries[1]).toEqual({ raw: 'Pokemon FireRed', platform: 'gba' })
  })
})

describe('loadPlaylist — includes', () => {
  it('parses includes list', () => {
    const path = write('big.yaml', `
name: Big Set
platform: gba
entries:
  - Game A
includes:
  - small-set
`)
    const result = loadPlaylist(path)
    expect(result.playlist!.includes).toEqual(['small-set'])
  })
})

describe('loadPlaylist — validation errors', () => {
  it('reports missing name', () => {
    const path = write('bad.yaml', `platform: gba\nentries:\n  - Game`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('name'))).toBe(true)
  })

  it('reports YAML parse error', () => {
    const path = write('broken.yaml', `name: [unclosed`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true)
  })
})

describe('loadAllPlaylists', () => {
  it('loads all .yaml files in directory', () => {
    write('a.yaml', `name: A\nplatform: gba\nentries:\n  - Game`)
    write('b.yaml', `name: B\nplatform: snes\nentries:\n  - Game`)
    const results = loadAllPlaylists(dir)
    expect(results).toHaveLength(2)
  })
})

describe('loadPlaylist — platform aliases', () => {
  it('expands entries for each platform in a YAML list', () => {
    const path = write('snes.yaml', `
name: SNES Best
platform:
  - snes
  - sfc
entries:
  - Super Mario World
  - Chrono Trigger
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toEqual(['snes', 'sfc'])
    expect(result.playlist!.entries).toHaveLength(4)
    const snesEntries = result.playlist!.entries.filter((e) => e.platform === 'snes')
    const sfcEntries = result.playlist!.entries.filter((e) => e.platform === 'sfc')
    expect(snesEntries).toHaveLength(2)
    expect(sfcEntries).toHaveLength(2)
    expect(snesEntries.map((e) => e.raw)).toContain('Super Mario World')
    expect(sfcEntries.map((e) => e.raw)).toContain('Chrono Trigger')
  })

  it('treats a single-element platform list identically to a platform string', () => {
    const path = write('gba-list.yaml', `
name: GBA Best
platform: [gba]
entries:
  - Castlevania - Aria of Sorrow (USA)
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toEqual(['gba'])
    expect(result.playlist!.entries).toHaveLength(1)
    expect(result.playlist!.entries[0].platform).toBe('gba')
  })

  it('treats an empty platform list as cross-platform', () => {
    const path = write('empty-plat.yaml', `
name: Cross Platform
platform: []
entries:
  gb:
    - Pokemon Red
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toBeNull()
  })
})
