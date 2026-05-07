import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, upsertRom, queryRomsByPlatform, queryAllRoms, clearRoms } from '../src/main/db'
import type { Database } from 'sql.js'

let db: Database

beforeEach(async () => {
  db = await openDb()
})

afterEach(() => {
  db.close()
})

describe('upsertRom', () => {
  it('inserts a new ROM', () => {
    upsertRom(db, {
      platform: 'gba',
      title: 'castlevania aria of sorrow',
      filename: 'Castlevania - Aria of Sorrow (USA).zip',
      path: '/Roms/gba/Castlevania - Aria of Sorrow (USA).zip',
      sizeBytes: 4_000_000
    })
    const rows = queryRomsByPlatform(db, 'gba')
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('castlevania aria of sorrow')
    expect(rows[0].platform).toBe('gba')
  })

  it('upserts on path conflict, updating title and size', () => {
    const path = '/Roms/gba/game.zip'
    upsertRom(db, { platform: 'gba', title: 'old title', filename: 'game.zip', path, sizeBytes: 100 })
    upsertRom(db, { platform: 'gba', title: 'new title', filename: 'game.zip', path, sizeBytes: 200 })
    const rows = queryRomsByPlatform(db, 'gba')
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('new title')
    expect(rows[0].sizeBytes).toBe(200)
  })
})

describe('queryAllRoms', () => {
  it('returns ROMs from all platforms', () => {
    upsertRom(db, { platform: 'gba', title: 'game a', filename: 'a.zip', path: '/a', sizeBytes: 1 })
    upsertRom(db, { platform: 'snes', title: 'game b', filename: 'b.zip', path: '/b', sizeBytes: 2 })
    expect(queryAllRoms(db)).toHaveLength(2)
  })
})

describe('clearRoms', () => {
  it('removes all rows', () => {
    upsertRom(db, { platform: 'gba', title: 't', filename: 'f.zip', path: '/p', sizeBytes: 0 })
    clearRoms(db)
    expect(queryRomsByPlatform(db, 'gba')).toHaveLength(0)
  })
})
