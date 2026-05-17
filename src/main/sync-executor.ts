import { copyFileSync, unlinkSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { SyncPreview, SyncResult, SyncProgress } from '@shared/types'

export async function executeSyncPlan(
  preview: SyncPreview,
  logDir: string,
  onProgress: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const errors: string[] = []
  let copiedCount = 0
  let deletedCount = 0

  // Copy phase
  for (let i = 0; i < preview.toCopy.length; i++) {
    const { rom, destination } = preview.toCopy[i]
    onProgress({
      status: 'running',
      copiedCount,
      totalCount: preview.toCopy.length,
      currentFile: rom.filename,
      error: null
    })

    try {
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(rom.path, destination)
      copiedCount++
    } catch (e: unknown) {
      const msg = `Failed to copy ${rom.filename}: ${e instanceof Error ? e.message : String(e)}`
      errors.push(msg)
      const logPath = writeLog(logDir, copiedCount, 0, preview.skipped.length, errors)
      onProgress({ status: 'error', copiedCount, totalCount: preview.toCopy.length, currentFile: rom.filename, error: msg })
      return { copiedCount, deletedCount, skippedCount: preview.skipped.length, errors, logPath }
    }
  }

  // Delete phase — only runs after all copies succeed
  for (const { path: filePath } of preview.toDelete) {
    try {
      unlinkSync(filePath)
      deletedCount++
    } catch (e: unknown) {
      errors.push(`Failed to delete ${filePath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const logPath = writeLog(logDir, copiedCount, deletedCount, preview.skipped.length, errors)
  onProgress({ status: 'done', copiedCount, totalCount: preview.toCopy.length, currentFile: '', error: null })

  return { copiedCount, deletedCount, skippedCount: preview.skipped.length, errors, logPath }
}

function writeLog(logDir: string, copied: number, deleted: number, skipped: number, errors: string[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = join(logDir, `sync-${timestamp}.log`)
  const lines = [
    `ROM Sync Log — ${new Date().toISOString()}`,
    `copied: ${copied}`,
    `deleted: ${deleted}`,
    `skipped: ${skipped}`,
    errors.length > 0 ? `errors:\n${errors.map((e) => `  - ${e}`).join('\n')}` : 'errors: none'
  ]
  mkdirSync(logDir, { recursive: true })
  writeFileSync(logPath, lines.join('\n'))
  return logPath
}
