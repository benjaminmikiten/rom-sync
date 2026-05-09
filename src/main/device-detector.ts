import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import yaml from 'js-yaml'
import type { DeviceConfig, MountedVolume } from '@shared/types'

interface DeviceConfigResult {
  config: DeviceConfig | null
  error: string | null
}

export function readDeviceConfig(mountPoint: string): DeviceConfigResult {
  const configPath = join(mountPoint, 'rom-sync.yaml')

  if (!existsSync(configPath)) {
    return { config: null, error: 'rom-sync.yaml not found on this volume' }
  }

  let raw: unknown
  try {
    raw = yaml.load(readFileSync(configPath, 'utf-8'))
  } catch (e: unknown) {
    return { config: null, error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!raw || typeof raw !== 'object') {
    return { config: null, error: 'rom-sync.yaml is empty or not an object' }
  }

  const doc = raw as Record<string, unknown>

  if (!doc['device_name'] || typeof doc['device_name'] !== 'string') {
    return { config: null, error: 'Missing required field: device_name' }
  }

  if (!doc['platforms'] || typeof doc['platforms'] !== 'object' || Array.isArray(doc['platforms'])) {
    return { config: null, error: 'Missing or invalid field: platforms (must be a map)' }
  }

  return {
    config: {
      deviceName: doc['device_name'],
      platforms: doc['platforms'] as Record<string, string>
    },
    error: null
  }
}

export function writeDeviceConfig(
  mountPoint: string,
  config: DeviceConfig
): { error: string | null } {
  const configPath = join(mountPoint, 'rom-sync.yaml')
  try {
    const content = yaml.dump({
      device_name: config.deviceName,
      platforms: config.platforms
    })
    writeFileSync(configPath, content, 'utf-8')
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// macOS only — lists /Volumes entries with disk space via `df`
export function listMountedVolumes(): MountedVolume[] {
  try {
    const volumes = readdirSync('/Volumes')
    return volumes
      .map((name): MountedVolume | null => {
        const mountPoint = `/Volumes/${name}`
        try {
          if (!statSync(mountPoint).isDirectory()) return null
          // execFileSync avoids shell injection — mountPoint is passed as a discrete arg
          const dfOut = execFileSync('df', ['-k', mountPoint], { encoding: 'utf-8' })
          const lines = dfOut.trim().split('\n')
          const parts = lines[1].trim().split(/\s+/)
          const totalBytes = parseInt(parts[1]) * 1024
          const usedBytes = parseInt(parts[2]) * 1024
          const availableBytes = totalBytes - usedBytes
          return { name, mountPoint, availableBytes, totalBytes }
        } catch {
          return null
        }
      })
      .filter((v): v is MountedVolume => v !== null)
  } catch {
    return []
  }
}
