import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { Database } from 'sql.js'
import { upsertRom } from './db'
import { normalizeTitle } from './normalizer'
import type { ScanProgress } from '@shared/types'

export async function scanLibrary(
  db: Database,
  libraryPath: string,
  onProgress: (progress: ScanProgress) => void
): Promise<void> {
  const platforms = readdirSync(libraryPath).filter((entry) => {
    try {
      return statSync(join(libraryPath, entry)).isDirectory()
    } catch {
      return false
    }
  })

  let current = 0

  for (const platform of platforms) {
    const platformDir = join(libraryPath, platform)
    let files: string[]
    try {
      files = readdirSync(platformDir).filter((f) => {
        if (f.startsWith('.') || f.toLowerCase().endsWith('.txt')) return false
        try {
          return statSync(join(platformDir, f)).isFile()
        } catch {
          return false
        }
      })
    } catch {
      continue
    }

    for (const filename of files) {
      const path = join(platformDir, filename)
      let sizeBytes = 0
      try {
        sizeBytes = statSync(path).size
      } catch {
        // ignore — file may have been removed between listing and stating
      }

      try {
        upsertRom(db, {
          platform,
          title: normalizeTitle(filename),
          filename,
          path,
          sizeBytes
        })
      } catch {
        // ignore — continue scanning remaining files
      }

      current++
      onProgress({ current, total: null, currentFile: filename })
    }
  }
}
