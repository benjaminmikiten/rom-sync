import initSqlJs from 'sql.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { Database } from 'sql.js'
import type { Rom } from '@shared/types'

export type { Database }

let _SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function getSql(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!_SQL) _SQL = await initSqlJs()
  return _SQL
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS roms (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    title         TEXT NOT NULL,
    filename      TEXT NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    matched_title TEXT,
    scanned_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_roms_platform ON roms(platform);
  CREATE INDEX IF NOT EXISTS idx_roms_title    ON roms(title);
`

export async function openDb(dbPath?: string): Promise<Database> {
  const SQL = await getSql()
  let db: Database

  if (dbPath && existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.exec(SCHEMA)
  return db
}

export function saveDb(db: Database, dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export function upsertRom(db: Database, rom: Omit<Rom, 'id' | 'scannedAt'>): void {
  db.run(
    `INSERT INTO roms (platform, title, filename, path, size_bytes, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       platform   = excluded.platform,
       title      = excluded.title,
       filename   = excluded.filename,
       size_bytes = excluded.size_bytes,
       scanned_at = excluded.scanned_at`,
    [rom.platform, rom.title, rom.filename, rom.path, rom.sizeBytes, Math.floor(Date.now() / 1000)]
  )
}

export function queryRomsByPlatform(db: Database, platform: string): Rom[] {
  const stmt = db.prepare(
    `SELECT id, platform, title, filename, path,
            size_bytes AS sizeBytes, scanned_at AS scannedAt
     FROM roms WHERE platform = ?`
  )
  stmt.bind([platform])
  const rows: Rom[] = []
  while (stmt.step()) {
    const obj = stmt.getAsObject()
    rows.push({
      id: obj['id'] as number,
      platform: obj['platform'] as string,
      title: obj['title'] as string,
      filename: obj['filename'] as string,
      path: obj['path'] as string,
      sizeBytes: (obj['sizeBytes'] ?? obj['size_bytes']) as number,
      scannedAt: (obj['scannedAt'] ?? obj['scanned_at']) as number,
    })
  }
  stmt.free()
  return rows
}

export function queryAllRoms(db: Database): Rom[] {
  const stmt = db.prepare(
    `SELECT id, platform, title, filename, path,
            size_bytes AS sizeBytes, scanned_at AS scannedAt
     FROM roms`
  )
  const rows: Rom[] = []
  while (stmt.step()) {
    const obj = stmt.getAsObject()
    rows.push({
      id: obj['id'] as number,
      platform: obj['platform'] as string,
      title: obj['title'] as string,
      filename: obj['filename'] as string,
      path: obj['path'] as string,
      sizeBytes: (obj['sizeBytes'] ?? obj['size_bytes']) as number,
      scannedAt: (obj['scannedAt'] ?? obj['scanned_at']) as number,
    })
  }
  stmt.free()
  return rows
}

export function clearRoms(db: Database): void {
  db.run('DELETE FROM roms')
}
