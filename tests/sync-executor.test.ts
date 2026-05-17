// tests/sync-executor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { executeSyncPlan } from '../src/main/sync-executor'
import type { SyncPreview, ResolvedRom, Rom } from '../src/shared/types'
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let srcDir: string
let dstDir: string
let logDir: string

beforeEach(() => {
  srcDir = mkdtempSync(join(tmpdir(), 'src-'))
  dstDir = mkdtempSync(join(tmpdir(), 'dst-'))
  logDir = mkdtempSync(join(tmpdir(), 'log-'))
  mkdirSync(join(dstDir, 'gba'), { recursive: true })
})

afterEach(() => {
  rmSync(srcDir, { recursive: true })
  rmSync(dstDir, { recursive: true })
  rmSync(logDir, { recursive: true })
})

const rom = (filename: string): Rom => ({
  id: 1, platform: 'gba', title: 'game', filename,
  path: join(srcDir, filename), sizeBytes: 5, scannedAt: 0
})

const resolved = (filename: string): ResolvedRom => ({
  rom: rom(filename),
  destination: join(dstDir, 'gba', filename)
})

describe('executeSyncPlan', () => {
  it('copies files to destination', async () => {
    writeFileSync(join(srcDir, 'Game.zip'), 'hello')
    const preview: SyncPreview = {
      toCopy: [resolved('Game.zip')],
      toDelete: [],
      skipped: [],
      totalCopyBytes: 5,
      availableBytes: 1_000_000
    }

    const result = await executeSyncPlan(preview, logDir, () => {})
    expect(existsSync(join(dstDir, 'gba', 'Game.zip'))).toBe(true)
    expect(result.copiedCount).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('deletes orphan files after copy', async () => {
    const orphan = join(dstDir, 'gba', 'Orphan.zip')
    writeFileSync(orphan, 'old')
    const preview: SyncPreview = {
      toCopy: [],
      toDelete: [{ platform: 'gba', path: orphan }],
      skipped: [],
      totalCopyBytes: 0,
      availableBytes: 1_000_000
    }

    const result = await executeSyncPlan(preview, logDir, () => {})
    expect(existsSync(orphan)).toBe(false)
    expect(result.deletedCount).toBe(1)
  })

  it('halts and skips deletes when a copy fails', async () => {
    // Source file does not exist — copy will fail
    const orphan = join(dstDir, 'gba', 'Orphan.zip')
    writeFileSync(orphan, 'old')
    const preview: SyncPreview = {
      toCopy: [resolved('Missing.zip')],
      toDelete: [{ platform: 'gba', path: orphan }],
      skipped: [],
      totalCopyBytes: 0,
      availableBytes: 1_000_000
    }

    const result = await executeSyncPlan(preview, logDir, () => {})
    expect(result.errors.length).toBeGreaterThan(0)
    // orphan must NOT be deleted when copy failed
    expect(existsSync(orphan)).toBe(true)
  })

  it('writes a log file', async () => {
    const preview: SyncPreview = {
      toCopy: [],
      toDelete: [],
      skipped: [],
      totalCopyBytes: 0,
      availableBytes: 1_000_000
    }

    const result = await executeSyncPlan(preview, logDir, () => {})
    expect(existsSync(result.logPath)).toBe(true)
    const logContent = readFileSync(result.logPath, 'utf-8')
    expect(logContent).toContain('copied')
  })
})
