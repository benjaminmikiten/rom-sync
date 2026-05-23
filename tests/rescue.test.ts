import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { copyFilesFromDevice, addEntriesToPlaylist, createPlaylistFromFilenames } from '../src/main/rescue'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let srcDir: string
let destDir: string
let playlistsDir: string

beforeEach(() => {
  srcDir = mkdtempSync(join(tmpdir(), 'rescue-src-'))
  destDir = mkdtempSync(join(tmpdir(), 'rescue-dst-'))
  playlistsDir = mkdtempSync(join(tmpdir(), 'rescue-pl-'))
})

afterEach(() => {
  rmSync(srcDir, { recursive: true })
  rmSync(destDir, { recursive: true })
  rmSync(playlistsDir, { recursive: true })
})

describe('copyFilesFromDevice', () => {
  it('copies a file to the destination', () => {
    writeFileSync(join(srcDir, 'Game.gba'), 'content')
    const dest = join(destDir, 'Game.gba')
    const result = copyFilesFromDevice([{ src: join(srcDir, 'Game.gba'), dest }])
    expect(result.copied).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(existsSync(dest)).toBe(true)
  })

  it('creates destination directories if they do not exist', () => {
    writeFileSync(join(srcDir, 'Game.gba'), 'content')
    const dest = join(destDir, 'deep', 'nested', 'Game.gba')
    copyFilesFromDevice([{ src: join(srcDir, 'Game.gba'), dest }])
    expect(existsSync(dest)).toBe(true)
  })

  it('records an error and continues when a source file is missing', () => {
    writeFileSync(join(srcDir, 'Good.gba'), 'content')
    const result = copyFilesFromDevice([
      { src: join(srcDir, 'Missing.gba'), dest: join(destDir, 'Missing.gba') },
      { src: join(srcDir, 'Good.gba'), dest: join(destDir, 'Good.gba') }
    ])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Missing.gba')
    expect(result.copied).toBe(1)
  })

  it('returns zero copied and empty errors for an empty pairs list', () => {
    const result = copyFilesFromDevice([])
    expect(result.copied).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})

describe('addEntriesToPlaylist', () => {
  it('appends normalized filenames to an existing playlist', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby'
    ].join('\n'))

    const result = addEntriesToPlaylist(playlistsDir, 'gba', ['Pokemon Emerald Seaglass (USA).gba'])
    expect(result).toEqual({ error: null })
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    expect(content).toContain('pokemon ruby')
    expect(content).toContain('pokemon emerald seaglass')
  })

  it('does not duplicate entries already in the playlist', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby'
    ].join('\n'))

    addEntriesToPlaylist(playlistsDir, 'gba', ['Pokemon Ruby (USA).gba'])
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    const matches = content.match(/pokemon ruby/g)
    expect(matches).toHaveLength(1)
  })

  it('returns error when the playlist stem does not exist', () => {
    const result = addEntriesToPlaylist(playlistsDir, 'nonexistent', ['Game.gba'])
    expect(result.error).toContain('nonexistent')
  })

  it('preserves existing entries when adding new ones', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby',
      '  - mario kart'
    ].join('\n'))

    addEntriesToPlaylist(playlistsDir, 'gba', ['Kirby (USA).gba'])
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    expect(content).toContain('pokemon ruby')
    expect(content).toContain('mario kart')
    expect(content).toContain('kirby')
  })
})

describe('createPlaylistFromFilenames', () => {
  it('creates a new playlist YAML with normalized entries', () => {
    const result = createPlaylistFromFilenames(
      playlistsDir, 'GBA Finds', 'gba',
      ['Pokemon Emerald Seaglass (USA).gba', 'Mario Kart (Europe).gba']
    )
    expect(result).toEqual({ stem: 'gba-finds' })
    const content = readFileSync(join(playlistsDir, 'gba-finds.yaml'), 'utf-8')
    expect(content).toContain('name: GBA Finds')
    expect(content).toContain('platform: gba')
    expect(content).toContain('pokemon emerald seaglass')
    expect(content).toContain('mario kart')
  })

  it('omits the platform line when platform is empty', () => {
    createPlaylistFromFilenames(playlistsDir, 'Mixed Finds', '', ['Game.gba'])
    const content = readFileSync(join(playlistsDir, 'mixed-finds.yaml'), 'utf-8')
    expect(content).not.toContain('platform:')
  })

  it('deduplicates entries that normalize to the same title', () => {
    createPlaylistFromFilenames(
      playlistsDir, 'GBA Finds', 'gba',
      ['Game (USA).gba', 'Game (Europe).gba']
    )
    const content = readFileSync(join(playlistsDir, 'gba-finds.yaml'), 'utf-8')
    const entryLines = content.split('\n').filter(l => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })

  it('returns error when name is empty', () => {
    const result = createPlaylistFromFilenames(playlistsDir, '   ', 'gba', ['Game.gba'])
    expect(result).toHaveProperty('error')
  })

  it('returns error when a playlist with that stem already exists', () => {
    writeFileSync(join(playlistsDir, 'gba-finds.yaml'), 'existing')
    const result = createPlaylistFromFilenames(playlistsDir, 'GBA Finds', 'gba', ['Game.gba'])
    expect(result).toHaveProperty('error')
  })
})
