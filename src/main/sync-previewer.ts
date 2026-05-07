import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { MatchResult, DeviceConfig, SyncPreview, ResolvedRom } from '@shared/types'

export function computeSyncPreview(
  matches: MatchResult[],
  deviceConfig: DeviceConfig,
  cardMountPoint: string
): SyncPreview {
  const toCopy: ResolvedRom[] = []
  const skipped: MatchResult[] = []

  // Track which filenames belong in each destination dir
  const keepByDir = new Map<string, Set<string>>()

  for (const match of matches) {
    if (match.status === 'none' || !match.rom) {
      skipped.push(match)
      continue
    }

    const platformRelPath = deviceConfig.platforms[match.rom.platform]
    if (!platformRelPath) {
      skipped.push(match)
      continue
    }

    const destDir = join(cardMountPoint, platformRelPath)
    const destPath = join(destDir, match.rom.filename)

    if (!keepByDir.has(destDir)) keepByDir.set(destDir, new Set())
    keepByDir.get(destDir)!.add(match.rom.filename)

    if (!existsSync(destPath)) {
      toCopy.push({ rom: match.rom, destination: destPath })
    }
  }

  // Files in mapped platform dirs not in keep set → delete
  const toDelete: string[] = []
  for (const platformRelPath of Object.values(deviceConfig.platforms)) {
    const dir = join(cardMountPoint, platformRelPath)
    if (!existsSync(dir)) continue

    const keepSet = keepByDir.get(dir) ?? new Set()
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!keepSet.has(file)) {
        toDelete.push(join(dir, file))
      }
    }
  }

  const totalCopyBytes = toCopy.reduce((sum, r) => sum + r.rom.sizeBytes, 0)

  return { toCopy, toDelete, skipped, totalCopyBytes, availableBytes: 0 }
}
