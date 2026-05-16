import { existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { readDeviceConfig } from './device-detector'
import { normalizeTitle } from './normalizer'

export function importPlaylistFromDeviceFolder(
  mountPoint: string,
  platform: string,
  name: string,
  playlistsDir: string
): { stem: string } | { error: string } {
  const trimmedName = name.trim()
  if (!trimmedName) return { error: 'Name is required' }

  const { config, error } = readDeviceConfig(mountPoint)
  if (!config) return { error: error ?? 'Could not read device config' }

  const platformPath = config.platforms[platform]
  if (!platformPath) return { error: `Platform '${platform}' not found in device config` }

  const folderPath = join(mountPoint, platformPath)
  let files: string[]
  try {
    files = readdirSync(folderPath).filter((f) => {
      if (f.startsWith('.') || f.toLowerCase().endsWith('.txt')) return false
      try {
        return statSync(join(folderPath, f)).isFile()
      } catch {
        return false
      }
    })
  } catch {
    return { error: `Could not read folder: ${platformPath}` }
  }

  const seen = new Set<string>()
  const entries: string[] = []
  for (const filename of files) {
    const title = normalizeTitle(filename)
    if (!title) continue
    if (!seen.has(title)) {
      seen.add(title)
      entries.push(title)
    }
  }

  const stem = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!stem) return { error: 'Name must contain at least one letter or number' }

  const yamlPath = join(playlistsDir, `${stem}.yaml`)
  if (existsSync(yamlPath)) {
    return { error: 'A playlist with that name already exists' }
  }

  const lines = [
    `name: ${yaml.dump(trimmedName).trimEnd()}`,
    `platform: ${platform}`,
    'entries:',
    ...entries.map((e) => `  - ${e}`)
  ]
  writeFileSync(yamlPath, lines.join('\n') + '\n')

  return { stem }
}
