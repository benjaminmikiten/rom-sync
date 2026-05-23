import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import yaml from 'js-yaml'
import { normalizeTitle } from './normalizer'

export function copyFilesFromDevice(
  pairs: { src: string; dest: string }[]
): { copied: number; errors: string[] } {
  const errors: string[] = []
  let copied = 0
  for (const { src, dest } of pairs) {
    try {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied++
    } catch (e: unknown) {
      errors.push(`Failed to copy ${src}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { copied, errors }
}

export function addEntriesToPlaylist(
  playlistsDir: string,
  stem: string,
  filenames: string[]
): { error: string | null } {
  const filePath = join(playlistsDir, `${stem}.yaml`)
  if (!existsSync(filePath)) return { error: `Playlist '${stem}' not found` }

  let raw: unknown
  try {
    raw = yaml.load(readFileSync(filePath, 'utf-8'))
  } catch (e: unknown) {
    return { error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!raw || typeof raw !== 'object') return { error: 'Playlist file is empty or invalid' }

  const doc = raw as Record<string, unknown>
  const rawEntries = doc['entries']
  const isFlatStringList =
    rawEntries == null ||
    (Array.isArray(rawEntries) && rawEntries.every((e): e is string => typeof e === 'string'))
  if (!isFlatStringList) {
    return { error: 'Cannot add entries: playlist uses a cross-platform format not supported by rescue' }
  }
  const existing: string[] = Array.isArray(rawEntries) ? rawEntries : []

  const existingSet = new Set(existing)
  const normalized = filenames.map(f => normalizeTitle(f)).filter(Boolean)
  const toAdd = normalized.filter(e => !existingSet.has(e))
  doc['entries'] = [...existing, ...toAdd]

  try {
    writeFileSync(filePath, yaml.dump(doc))
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export function createPlaylistFromFilenames(
  playlistsDir: string,
  name: string,
  platform: string,
  filenames: string[]
): { stem: string } | { error: string } {
  const trimmedName = name.trim()
  const stem = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!stem) return { error: 'Name must contain at least one letter or number' }

  const yamlPath = join(playlistsDir, `${stem}.yaml`)
  if (existsSync(yamlPath)) return { error: 'A playlist with that name already exists' }

  const entries = [...new Set(filenames.map(f => normalizeTitle(f)).filter(Boolean))]
  const lines = [
    `name: ${yaml.dump(trimmedName).trimEnd()}`,
    platform ? `platform: ${platform}` : null,
    'entries:',
    ...entries.map(e => `  - ${e}`)
  ].filter((l): l is string => l !== null)

  try {
    mkdirSync(playlistsDir, { recursive: true })
    writeFileSync(yamlPath, lines.join('\n') + '\n')
    return { stem }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
