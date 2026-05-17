import React from 'react'
import type { SyncPreview as SyncPreviewType, SkippedEntry } from '@shared/types'
import { StorageBar } from './StorageBar'

function skipPlatform(s: SkippedEntry): string {
  if (s.reason === 'platform-not-mapped' && s.match.rom) return s.match.rom.platform
  const p = s.match.entry.platform
  return Array.isArray(p) ? p[0] : p
}

function groupToDelete(items: { platform: string; path: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const { platform, path } of items) {
    if (!map.has(platform)) map.set(platform, [])
    map.get(platform)!.push(path.split('/').pop() ?? path)
  }
  return map
}

function groupSkipped(items: SkippedEntry[]): Map<string, SkippedEntry[]> {
  const map = new Map<string, SkippedEntry[]>()
  for (const s of items) {
    const platform = skipPlatform(s)
    if (!map.has(platform)) map.set(platform, [])
    map.get(platform)!.push(s)
  }
  return map
}

const REASON_LABEL: Record<string, string> = {
  'no-match': 'no library match',
  'platform-not-mapped': 'platform not on device'
}

interface Props {
  preview: SyncPreviewType
}

export function SyncPreviewPanel({ preview }: Props): React.JSX.Element {
  const deleteGroups = groupToDelete(preview.toDelete)
  const skipGroups = groupSkipped(preview.skipped)

  return (
    <div>
      <StorageBar
        available={preview.availableBytes}
        total={preview.availableBytes + preview.totalCopyBytes}
        projectedAdd={preview.totalCopyBytes}
      />

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>

        {/* To Copy — flat, unchanged */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#4caf50', fontWeight: 700, marginBottom: 8 }}>
            To Copy ({preview.toCopy.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {preview.toCopy.map((r, i) => (
              <div key={i} style={{ padding: '2px 0', color: '#aaa' }}>{r.rom.filename}</div>
            ))}
          </div>
        </div>

        {/* To Delete — grouped by platform */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#f44336', fontWeight: 700, marginBottom: 8 }}>
            To Delete ({preview.toDelete.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from(deleteGroups.entries()).map(([platform, filenames]) => (
              <div key={platform} style={{ marginTop: 8 }}>
                <div style={{ color: '#ccc', fontWeight: 700, fontSize: 11 }}>
                  {platform} ({filenames.length})
                </div>
                {filenames.map((name, i) => (
                  <div key={i} style={{ padding: '2px 0 2px 12px', color: '#aaa' }}>{name}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Skipped — grouped by platform with reason label */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#ff9800', fontWeight: 700, marginBottom: 8 }}>
            Skipped ({preview.skipped.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from(skipGroups.entries()).map(([platform, entries]) => (
              <div key={platform} style={{ marginTop: 8 }}>
                <div style={{ color: '#ccc', fontWeight: 700, fontSize: 11 }}>
                  {platform} ({entries.length})
                </div>
                {entries.map((s, i) => (
                  <div key={i} style={{ padding: '2px 0 2px 12px', color: '#aaa' }}>
                    {s.match.entry.raw}
                    <span style={{ color: '#555', fontSize: 11, marginLeft: 6 }}>
                      · {REASON_LABEL[s.reason]}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
