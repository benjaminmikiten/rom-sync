import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scanLibrary } from '../src/main/scanner'
import { openDb, queryRomsByPlatform, queryAllRoms } from '../src/main/db'
import type { Database } from 'sql.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let db: Database
let tmpDir: string

beforeEach(async () => {
  db = await openDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'rom-sync-test-'))
})

afterEach(() => {
  db.close()
  rmSync(tmpDir, { recursive: true })
})

function makeRom(platform: string, filename: string): string {
  const dir = join(tmpDir, platform)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, filename)
  writeFileSync(path, 'dummy')
  return path
}

describe('scanLibrary', () => {
  it('indexes ROMs from platform subdirectories', async () => {
    makeRom('gba', 'Castlevania - Aria of Sorrow (USA).zip')
    makeRom('snes', 'Super Metroid (USA).zip')

    const progress: number[] = []
    await scanLibrary(db, tmpDir, (p) => progress.push(p.current))

    const gba = queryRomsByPlatform(db, 'gba')
    const snes = queryRomsByPlatform(db, 'snes')
    expect(gba).toHaveLength(1)
    expect(gba[0].title).toBe('castlevania aria of sorrow')
    expect(gba[0].platform).toBe('gba')
    expect(snes).toHaveLength(1)
    expect(snes[0].title).toBe('super metroid')
  })

  it('reports progress callbacks', async () => {
    makeRom('gba', 'Game A.zip')
    makeRom('gba', 'Game B.zip')

    const counts: number[] = []
    await scanLibrary(db, tmpDir, (p) => counts.push(p.current))

    expect(counts.length).toBeGreaterThan(0)
    expect(counts[counts.length - 1]).toBe(2)
  })

  it('upserts on rescan — no duplicate rows', async () => {
    makeRom('gba', 'Game (USA).zip')
    await scanLibrary(db, tmpDir, () => {})
    await scanLibrary(db, tmpDir, () => {})

    expect(queryAllRoms(db)).toHaveLength(1)
  })

  it('skips subdirectories inside platform dirs', async () => {
    const dir = join(tmpDir, 'gba', 'subdir')
    mkdirSync(dir, { recursive: true })
    makeRom('gba', 'Game.zip')

    await scanLibrary(db, tmpDir, () => {})
    expect(queryRomsByPlatform(db, 'gba')).toHaveLength(1)
  })
})
