import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { MountedVolume, SyncPreview, SyncProgress as SyncProgressType, SyncResult } from '@shared/types'
import { SyncPreviewPanel } from '../components/SyncPreview'
import { SyncProgressPanel } from '../components/SyncProgress'

export function SyncView(): React.JSX.Element {
  const [volumes, setVolumes] = useState<MountedVolume[]>([])
  const [selectedVolume, setSelectedVolume] = useState<string>('')
  const [preview, setPreview] = useState<SyncPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgressType | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  // In a future task, playlist stems would come from device assignment config.
  // For now, empty array produces a valid preview (shows all card files as to-delete).
  const [playlistStems] = useState<string[]>([])

  useEffect(() => { api.listDevices().then(setVolumes) }, [])
  useEffect(() => { const unsub = api.onSyncProgress(setProgress as (p: unknown) => void); return unsub }, [])

  async function handlePreview(): Promise<void> {
    if (!selectedVolume) return
    setPreviewLoading(true)
    setPreview(null)
    const p = await api.previewSync(selectedVolume, playlistStems)
    setPreview(p)
    setPreviewLoading(false)
  }

  async function handleSync(): Promise<void> {
    if (!selectedVolume || !preview) return
    setSyncing(true)
    setResult(null)
    setProgress(null)
    const r = await api.executeSync(selectedVolume, playlistStems)
    setResult(r)
    setSyncing(false)
  }

  const storageOverflow = preview ? preview.totalCopyBytes > preview.availableBytes : false

  return (
    <div>
      <h2>Sync</h2>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Target Device</label>
        <select
          value={selectedVolume}
          onChange={(e) => { setSelectedVolume(e.target.value); setPreview(null) }}
          style={{ padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
        >
          <option value="">— Select a device —</option>
          {volumes.map((v) => <option key={v.mountPoint} value={v.mountPoint}>{v.name}</option>)}
        </select>
        <button
          onClick={handlePreview} disabled={!selectedVolume || previewLoading}
          style={{ marginLeft: 12, padding: '8px 16px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {previewLoading ? 'Computing…' : 'Preview Sync'}
        </button>
      </div>

      {preview && (
        <>
          <SyncPreviewPanel preview={preview} />
          <button
            onClick={handleSync} disabled={syncing || storageOverflow}
            style={{
              padding: '10px 28px',
              background: storageOverflow ? '#555' : '#4caf50',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: storageOverflow || syncing ? 'default' : 'pointer',
              fontWeight: 700, fontSize: 15
            }}
          >
            {syncing ? 'Syncing…' : storageOverflow ? 'Insufficient Space' : 'Sync Now'}
          </button>
        </>
      )}

      {progress && <div style={{ marginTop: 20 }}><SyncProgressPanel progress={progress} /></div>}

      {result && (
        <div style={{ marginTop: 20, padding: 16, background: '#1e1e1e', borderRadius: 6 }}>
          <h3 style={{ margin: '0 0 8px' }}>Sync Complete</h3>
          <p>Copied: {result.copiedCount} · Deleted: {result.deletedCount} · Skipped: {result.skippedCount}</p>
          {result.errors.length > 0 && (
            <div style={{ color: '#f44336' }}>{result.errors.map((e, i) => <div key={i}>{e}</div>)}</div>
          )}
          <p style={{ fontSize: 12, color: '#888' }}>Log: {result.logPath}</p>
        </div>
      )}
    </div>
  )
}
