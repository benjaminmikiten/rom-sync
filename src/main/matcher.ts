import Fuse from 'fuse.js'
import type { Database } from 'sql.js'
import { queryRomsByPlatform } from './db'
import { normalizeTitle } from './normalizer'
import type { PlaylistEntry, MatchResult, MatchStatus } from '@shared/types'

// When two platforms both produce the same quality match (e.g. two exact matches),
// the first-encountered platform wins (Map insertion order). This is deterministic
// for a given playlist but not user-configurable.
function isBetterMatch(candidate: MatchResult, existing: MatchResult): boolean {
  const rank: Record<MatchStatus, number> = { exact: 2, fuzzy: 1, none: 0 }
  if (rank[candidate.status] > rank[existing.status]) return true
  if (candidate.status === 'fuzzy' && existing.status === 'fuzzy' &&
      candidate.score !== null && existing.score !== null) {
    return candidate.score < existing.score
  }
  return false
}

export function matchEntries(
  db: Database,
  entries: PlaylistEntry[],
  threshold: number
): MatchResult[] {
  // Group entries by platform to avoid rebuilding Fuse index repeatedly.
  // Entries with platform: string[] appear in multiple groups.
  const byPlatform = new Map<string, PlaylistEntry[]>()
  for (const entry of entries) {
    const platforms = Array.isArray(entry.platform) ? entry.platform : [entry.platform]
    for (const p of platforms) {
      const list = byPlatform.get(p) ?? []
      list.push(entry)
      byPlatform.set(p, list)
    }
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
        const candidate: MatchResult = { entry, status: 'exact', rom: exact, score: null }
        const existing = resultMap.get(entry)
        if (!existing || isBetterMatch(candidate, existing)) resultMap.set(entry, candidate)
        continue
      }

      const hits = fuse.search(normalized)
      const candidate: MatchResult = hits.length > 0 && hits[0].score !== undefined && hits[0].score <= threshold
        ? { entry, status: 'fuzzy', rom: hits[0].item, score: hits[0].score }
        : { entry, status: 'none', rom: null, score: null }
      const existing = resultMap.get(entry)
      if (!existing || isBetterMatch(candidate, existing)) resultMap.set(entry, candidate)
    }
  }

  return entries.map((e) => resultMap.get(e) ?? { entry: e, status: 'none' as const, rom: null, score: null })
}
