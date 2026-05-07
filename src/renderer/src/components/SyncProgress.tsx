import React from 'react'
import type { SyncProgress as SyncProgressType } from '@shared/types'

interface Props {
  progress: SyncProgressType
}

export function SyncProgressPanel({ progress }: Props): React.JSX.Element {
  const pct = progress.totalCount > 0 ? (progress.copiedCount / progress.totalCount) * 100 : 0

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        {progress.status === 'done' && <span style={{ color: '#4caf50', fontWeight: 700 }}>Sync complete</span>}
        {progress.status === 'error' && <span style={{ color: '#f44336', fontWeight: 700 }}>Sync failed: {progress.error}</span>}
        {progress.status === 'running' && <span>Syncing… {progress.currentFile}</span>}
      </div>
      <div style={{ height: 8, background: '#2a2a2a', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: progress.status === 'error' ? '#f44336' : '#4a9eff', transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>{progress.copiedCount} / {progress.totalCount} files copied</div>
    </div>
  )
}
