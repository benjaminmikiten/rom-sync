import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readDeviceConfig, writeDeviceConfig } from '../src/main/device-detector'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
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
    expect(result.error).toBeNull()
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
      platforms: { gba: '/Roms/GBA', snes: '/Roms/SNES' }
    }
    const result = writeDeviceConfig(dir, config)
    expect(result.error).toBeNull()

    const readBack = readDeviceConfig(dir)
    expect(readBack.error).toBeNull()
    expect(readBack.config).toEqual(config)
  })

  it('returns an error when the mount point does not exist', () => {
    const result = writeDeviceConfig('/nonexistent/path/xyz', {
      deviceName: 'Test',
      platforms: { gba: '/Roms/GBA' }
    })
    expect(result.error).not.toBeNull()
  })

  it('returns an error when deviceName is empty', () => {
    const result = writeDeviceConfig(dir, { deviceName: '', platforms: { gba: '/Roms/GBA' } })
    expect(result.error).not.toBeNull()
  })
})
