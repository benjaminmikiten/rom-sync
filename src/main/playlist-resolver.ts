import type { Playlist, PlaylistEntry } from '@shared/types'

interface ResolveResult {
  entries: PlaylistEntry[]
  error: string | null
}

export function resolvePlaylist(
  stem: string,
  allPlaylists: Record<string, Playlist>,
  visited: Set<string> = new Set()
): ResolveResult {
  if (visited.has(stem)) {
    return { entries: [], error: `Circular include detected: ${[...visited, stem].join(' → ')}` }
  }

  const playlist = allPlaylists[stem]
  if (!playlist) {
    return { entries: [], error: `Playlist not found: ${stem}` }
  }

  visited.add(stem)
  const allEntries: PlaylistEntry[] = [...playlist.entries]

  for (const includeStem of playlist.includes) {
    const sub = resolvePlaylist(includeStem, allPlaylists, new Set(visited))
    if (sub.error) return { entries: [], error: sub.error }
    allEntries.push(...sub.entries)
  }

  return { entries: allEntries, error: null }
}

export function detectCircularIncludes(
  stem: string,
  allPlaylists: Record<string, Playlist>
): string | null {
  return resolvePlaylist(stem, allPlaylists).error
}
