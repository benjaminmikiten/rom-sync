import React, { useState } from 'react'
import type { SyncPreview as SyncPreviewType, SkippedEntry, SkipReason } from '@shared/types'
import { StorageBar } from './StorageBar'
import { RescueModal } from './RescueModal'

function skipPlatform(s: SkippedEntry): string {
  if (s.reason === 'platform-not-mapped' && s.match.rom) return s.match.rom.platform
  const p = s.match.entry.platform
  return Array.isArray(p) ? (p[0] ?? 'unknown') : p
}

function groupToDelete(
  items: { platform: string; path: string }[]
): Map<string, { path: string; filename: string }[]> {
  const map = new Map<string, { path: string; filename: string }[]>()
  for (const { platform, path } of items) {
    const bucket = map.get(platform) ?? []
    map.set(platform, bucket)
    bucket.push({ path, filename: path.split('/').pop() ?? path })
  }
  return map
}

function groupSkipped(items: SkippedEntry[]): Map<string, SkippedEntry[]> {
  const map = new Map<string, SkippedEntry[]>()
  for (const s of items) {
    const platform = skipPlatform(s)
    const bucket = map.get(platform) ?? []
    map.set(platform, bucket)
    bucket.push(s)
  }
  return map
}

const REASON_LABEL: Record<SkipReason, string> = {
  'no-match': 'no library match',
  'platform-not-mapped': 'platform not on device'
}

interface Props {
  preview: SyncPreviewType
  onRescueComplete: () => void
}

export function SyncPreviewPanel({ preview, onRescueComplete }: Props): React.JSX.Element {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [rescueOpen, setRescueOpen] = useState(false)

  const deleteGroups = groupToDelete(preview.toDelete)
  const skipGroups = groupSkipped(preview.skipped)

  function togglePath(path: string): void {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleGroup(paths: string[]): void {
    const allSelected = paths.every(p => selectedPaths.has(p))
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (allSelected) paths.forEach(p => next.delete(p))
      else paths.forEach(p => next.add(p))
      return next
    })
  }

  const selectedItems = preview.toDelete.filter(item => selectedPaths.has(item.path))

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

        {/* To Delete — grouped by platform with selection */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#f44336', fontWeight: 700, marginBottom: 8 }}>
            To Delete ({preview.toDelete.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from(deleteGroups.entries()).map(([platform, items]) => {
              const paths = items.map(i => i.path)
              const allSelected = paths.length > 0 && paths.every(p => selectedPaths.has(p))
              return (
                <div key={platform} style={{ marginTop: 8 }}>
                  <div style={{ color: '#ccc', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(paths)} />
                    {platform} ({items.length})
                  </div>
                  {items.map(({ path, filename }) => (
                    <div key={path} style={{ padding: '2px 0 2px 12px', color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={selectedPaths.has(path)} onChange={() => togglePath(path)} />
                      {filename}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {selectedPaths.size > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #333' }}>
              <button
                onClick={() => setRescueOpen(true)}
                style={{ padding: '6px 14px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                Rescue {selectedPaths.size} {selectedPaths.size === 1 ? 'item' : 'items'} →
              </button>
            </div>
          )}
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

      {rescueOpen && (
        <RescueModal
          items={selectedItems}
          onClose={() => setRescueOpen(false)}
          onComplete={() => {
            setRescueOpen(false)
            setSelectedPaths(new Set())
            onRescueComplete()
          }}
        />
      )}
    </div>
  )
}
