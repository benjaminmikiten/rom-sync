import React from 'react'
import type { SyncPreview as SyncPreviewType } from '@shared/types'
import { StorageBar } from './StorageBar'

interface Props {
  preview: SyncPreviewType
}

export function SyncPreviewPanel({ preview }: Props): React.JSX.Element {
  return (
    <div>
      <StorageBar
        available={preview.availableBytes}
        total={preview.availableBytes + preview.totalCopyBytes}
        projectedAdd={preview.totalCopyBytes}
      />

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        {[
          { label: 'To Copy', color: '#4caf50', items: preview.toCopy.map((r) => r.rom.filename) },
          { label: 'To Delete', color: '#f44336', items: preview.toDelete.map((p) => p.split('/').pop() ?? p) },
          { label: 'Skipped', color: '#ff9800', items: preview.skipped.map((m) => m.entry.raw) }
        ].map(({ label, color, items }) => (
          <div key={label} style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
            <div style={{ color, fontWeight: 700, marginBottom: 8 }}>{label} ({items.length})</div>
            <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
              {items.map((item, i) => (
                <div key={i} style={{ padding: '2px 0', color: '#aaa' }}>{item}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
