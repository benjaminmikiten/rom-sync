import Fuse from 'fuse.js'
import type { Database } from 'sql.js'
import { queryRomsByPlatform } from './db'
import { normalizeTitle } from './normalizer'
import type { PlaylistEntry, MatchResult } from '@shared/types'

export function matchEntries(
  db: Database,
  entries: PlaylistEntry[],
  threshold: number
): MatchResult[] {
  // Group entries by platform to avoid rebuilding Fuse index repeatedly
  const byPlatform = new Map<string, PlaylistEntry[]>()
  for (const entry of entries) {
    const list = byPlatform.get(entry.platform) ?? []
    list.push(entry)
    byPlatform.set(entry.platform, list)
  }

  const resultMap = new Map<PlaylistEntry, MatchResult>()

  for (const [platform, platformEntries] of byPlatform) {
    const roms = queryRomsByPlatform(db, platform)
    // Use threshold squared as the Fuse config threshold to avoid spurious
    // partial-word matches (e.g. "super metroid" matching "metroid fusion").
    // The user-supplied threshold is still applied to the returned scores.
    const fuse = new Fuse(roms, {
      keys: ['title'],
      threshold: threshold * threshold,
      includeScore: true,
      shouldSort: true
    })

    for (const entry of platformEntries) {
      const normalized = normalizeTitle(entry.raw)
      // Check exact match first
      const exact = roms.find((r) => r.title === normalized)
      if (exact) {
        resultMap.set(entry, { entry, status: 'exact', rom: exact, score: null })
        continue
      }

      const hits = fuse.search(normalized)
      if (hits.length > 0 && hits[0].score !== undefined && hits[0].score <= threshold) {
        resultMap.set(entry, {
          entry,
          status: 'fuzzy',
          rom: hits[0].item,
          score: hits[0].score
        })
      } else {
        resultMap.set(entry, { entry, status: 'none', rom: null, score: null })
      }
    }
  }

  return entries.map((e) => resultMap.get(e)!)
}
