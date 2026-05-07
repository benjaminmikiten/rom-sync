import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { matchEntries } from '../src/main/matcher'
import { openDb, upsertRom } from '../src/main/db'
import type { Database } from 'sql.js'
import type { PlaylistEntry } from '../src/shared/types'

let db: Database

beforeEach(async () => {
  db = await openDb()
  upsertRom(db, { platform: 'gba', title: 'castlevania aria of sorrow', filename: 'Castlevania - Aria of Sorrow (USA).zip', path: '/gba/cas.zip', sizeBytes: 1000 })
  upsertRom(db, { platform: 'gba', title: 'metroid fusion', filename: 'Metroid Fusion (USA).zip', path: '/gba/met.zip', sizeBytes: 2000 })
  upsertRom(db, { platform: 'snes', title: 'super metroid', filename: 'Super Metroid (USA).zip', path: '/snes/sm.zip', sizeBytes: 3000 })
})

afterEach(() => db.close())

const entry = (raw: string, platform: string): PlaylistEntry => ({ raw, platform })

describe('matchEntries', () => {
  it('returns exact match for perfect normalized title', () => {
    const results = matchEntries(db, [entry('Castlevania - Aria of Sorrow (USA)', 'gba')], 0.6)
    expect(results[0].status).toBe('exact')
    expect(results[0].rom?.filename).toBe('Castlevania - Aria of Sorrow (USA).zip')
  })

  it('returns fuzzy match for close title', () => {
    const results = matchEntries(db, [entry('Castlevania Aria of Sorrow', 'gba')], 0.6)
    expect(['exact', 'fuzzy']).toContain(results[0].status)
    expect(results[0].rom).not.toBeNull()
  })

  it('returns none for unrecognized title', () => {
    const results = matchEntries(db, [entry('Completely Unknown Game XYZ 9999', 'gba')], 0.6)
    expect(results[0].status).toBe('none')
    expect(results[0].rom).toBeNull()
  })

  it('only matches within the correct platform', () => {
    // super metroid is snes, querying gba should not match
    const results = matchEntries(db, [entry('Super Metroid', 'gba')], 0.6)
    expect(results[0].status).toBe('none')
  })
})
