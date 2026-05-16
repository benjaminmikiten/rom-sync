import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { importPlaylistFromDeviceFolder } from '../src/main/playlist-importer'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let mountPoint: string
let playlistsDir: string

beforeEach(() => {
  mountPoint = mkdtempSync(join(tmpdir(), 'device-'))
  playlistsDir = mkdtempSync(join(tmpdir(), 'playlists-'))
  writeFileSync(join(mountPoint, 'rom-sync.yaml'), [
    'device_name: Test Device',
    'platforms:',
    '  nds: /ROMS/DS'
  ].join('\n'))
  mkdirSync(join(mountPoint, 'ROMS', 'DS'), { recursive: true })
})

afterEach(() => {
  rmSync(mountPoint, { recursive: true })
  rmSync(playlistsDir, { recursive: true })
})

describe('importPlaylistFromDeviceFolder', () => {
  it('creates a playlist YAML from files in the mapped folder', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Castlevania - Dawn of Sorrow (USA).nds'), 'dummy')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Mario Kart DS (USA).nds'), 'dummy')

    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect(result).toEqual({ stem: 'ds-games' })

    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    expect(yaml).toContain('name: DS Games')
    expect(yaml).toContain('platform: nds')
    expect(yaml).toContain('  - castlevania dawn of sorrow')
    expect(yaml).toContain('  - mario kart ds')
  })

  it('returns error when name is empty', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', '', playlistsDir)
    expect(result).toEqual({ error: 'Name is required' })
  })

  it('returns error when name is only whitespace', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', '   ', playlistsDir)
    expect(result).toEqual({ error: 'Name is required' })
  })

  it('returns error when device config is missing', () => {
    const emptyMount = mkdtempSync(join(tmpdir(), 'empty-'))
    try {
      const result = importPlaylistFromDeviceFolder(emptyMount, 'nds', 'DS Games', playlistsDir)
      expect('error' in result).toBe(true)
    } finally {
      rmSync(emptyMount, { recursive: true })
    }
  })

  it('returns error when platform is not in device config', () => {
    const result = importPlaylistFromDeviceFolder(mountPoint, 'gba', 'GBA Games', playlistsDir)
    expect(result).toEqual({ error: "Platform 'gba' not found in device config" })
  })

  it('returns error when folder does not exist', () => {
    rmSync(join(mountPoint, 'ROMS', 'DS'), { recursive: true })
    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toContain('Could not read folder')
  })

  it('returns error on stem collision', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game.nds'), 'dummy')
    writeFileSync(join(playlistsDir, 'ds-games.yaml'), 'existing')

    const result = importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    expect(result).toEqual({ error: 'A playlist with that name already exists' })
  })

  it('deduplicates normalized titles', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game (USA).nds'), 'dummy')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game (Europe).nds'), 'dummy')

    importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    const entryLines = yaml.split('\n').filter((l) => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })

  it('skips hidden files and .txt files', () => {
    writeFileSync(join(mountPoint, 'ROMS', 'DS', '.DS_Store'), 'hidden')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'readme.txt'), 'text')
    writeFileSync(join(mountPoint, 'ROMS', 'DS', 'Game.nds'), 'dummy')

    importPlaylistFromDeviceFolder(mountPoint, 'nds', 'DS Games', playlistsDir)
    const yaml = readFileSync(join(playlistsDir, 'ds-games.yaml'), 'utf-8')
    const entryLines = yaml.split('\n').filter((l) => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })
})
