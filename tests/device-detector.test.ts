import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readDeviceConfig, writeDeviceConfig, listSubdirs } from '../src/main/device-detector'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dev-test-')) })
afterEach(() => rmSync(dir, { recursive: true }))

describe('readDeviceConfig', () => {
  it('parses a valid rom-sync.yaml', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: MiSTer FPGA
platforms:
  gba: /games/gba
  snes: /games/snes
`)
    const result = readDeviceConfig(dir)
    expect(result.config).not.toBeNull()
    expect(result.config!.deviceName).toBe('MiSTer FPGA')
    expect(result.config!.platforms['gba']).toBe('/games/gba')
    expect(result.config!.playlists).toEqual([])
    expect(result.error).toBeNull()
  })

  it('parses playlists field when present', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
playlists:
  - gba-favorites
  - snes-classics
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual(['gba-favorites', 'snes-classics'])
  })

  it('defaults playlists to [] when key is absent', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual([])
  })

  it('defaults playlists to [] when value is not an array', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
playlists: not-an-array
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual([])
  })

  it('returns error when rom-sync.yaml is missing', () => {
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).toMatch(/not found/i)
  })

  it('returns error when device_name is missing', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `platforms:\n  gba: /games/gba`)
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).toMatch(/device_name/i)
  })

  it('returns error for YAML parse failure', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `device_name: [broken`)
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).not.toBeNull()
  })
})

describe('writeDeviceConfig', () => {
  it('writes a valid rom-sync.yaml that readDeviceConfig can read back', () => {
    const config = {
      deviceName: 'My Card',
      platforms: { gba: '/Roms/GBA', snes: '/Roms/SNES' },
      playlists: []
    }
    const result = writeDeviceConfig(dir, config)
    expect(result.error).toBeNull()

    const readBack = readDeviceConfig(dir)
    expect(readBack.error).toBeNull()
    expect(readBack.config).toEqual(config)
  })

  it('round-trips playlists correctly', () => {
    const config = {
      deviceName: 'My Card',
      platforms: { gba: '/Roms/GBA' },
      playlists: ['gba-favorites', 'all-gba']
    }
    writeDeviceConfig(dir, config)
    const readBack = readDeviceConfig(dir)
    expect(readBack.config!.playlists).toEqual(['gba-favorites', 'all-gba'])
  })

  it('omits playlists key when list is empty', () => {
    writeDeviceConfig(dir, { deviceName: 'My Card', platforms: { gba: '/Roms/GBA' }, playlists: [] })
    const raw = readFileSync(join(dir, 'rom-sync.yaml'), 'utf-8')
    expect(raw).not.toContain('playlists')
  })

  it('returns an error when the mount point does not exist', () => {
    const result = writeDeviceConfig('/nonexistent/path/xyz', {
      deviceName: 'Test',
      platforms: { gba: '/Roms/GBA' },
      playlists: []
    })
    expect(result.error).not.toBeNull()
  })

  it('returns an error when deviceName is empty', () => {
    const result = writeDeviceConfig(dir, { deviceName: '', platforms: { gba: '/Roms/GBA' }, playlists: [] })
    expect(result.error).not.toBeNull()
  })
})

describe('listSubdirs', () => {
  it('returns names of immediate subdirectories', () => {
    mkdirSync(join(dir, 'GBA'))
    mkdirSync(join(dir, 'SNES'))
    writeFileSync(join(dir, 'not-a-dir.txt'), '')
    const result = listSubdirs(dir)
    expect(result).toHaveLength(2)
    expect(result).toContain('GBA')
    expect(result).toContain('SNES')
    expect(result).not.toContain('not-a-dir.txt')
  })

  it('returns empty array for nonexistent path', () => {
    expect(listSubdirs('/nonexistent/path/xyz')).toEqual([])
  })

  it('returns empty array for empty directory', () => {
    expect(listSubdirs(dir)).toEqual([])
  })
})
