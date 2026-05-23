import React, { useEffect, useState } from 'react'
import type { AppConfig, Playlist } from '@shared/types'
import { api } from '../api'

interface Props {
  items: { platform: string; path: string }[]
  onClose: () => void
  onComplete: () => void
}

function filenameOf(path: string): string {
  return path.split('/').pop() ?? path
}

function groupByPlatform(
  items: { platform: string; path: string }[]
): Map<string, { platform: string; path: string }[]> {
  const map = new Map<string, { platform: string; path: string }[]>()
  for (const item of items) {
    const bucket = map.get(item.platform) ?? []
    map.set(item.platform, bucket)
    bucket.push(item)
  }
  return map
}

export function RescueModal({ items, onClose, onComplete }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<AppConfig | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [copyEnabled, setCopyEnabled] = useState(true)
  const [playlistEnabled, setPlaylistEnabled] = useState(true)
  const [destOverrides, setDestOverrides] = useState<Record<string, string>>({})
  const [playlistChoice, setPlaylistChoice] = useState<string>('new')
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s)
      const overrides: Record<string, string> = {}
      for (const item of items) {
        if (!overrides[item.platform]) {
          overrides[item.platform] = `${s.libraryPath}/${item.platform}`
        }
      }
      setDestOverrides(overrides)
    })
    api.listPlaylists().then(results => {
      setPlaylists(results.filter(r => r.playlist !== null).map(r => r.playlist!))
    })
  }, [items])

  const platforms = [...new Set(items.map(i => i.platform))]
  const inferredPlatform = platforms.length === 1 ? platforms[0] : ''
  const groups = groupByPlatform(items)

  async function handleFolderPick(platform: string): Promise<void> {
    const picked = await api.openFolderPicker()
    if (picked) setDestOverrides(prev => ({ ...prev, [platform]: picked }))
  }

  async function handleConfirm(): Promise<void> {
    setWorking(true)
    setError(null)

    if (copyEnabled && settings) {
      const pairs = items.map(item => ({
        src: item.path,
        dest: `${destOverrides[item.platform] ?? `${settings.libraryPath}/${item.platform}`}/${filenameOf(item.path)}`
      }))
      const result = await api.copyFromDevice(pairs)
      if (result.errors.length > 0) {
        setError(`Copy errors:\n${result.errors.join('\n')}`)
        setWorking(false)
        return
      }
    }

    if (playlistEnabled) {
      const filenames = items.map(i => filenameOf(i.path))
      if (playlistChoice === 'new') {
        const r = await api.createPlaylistFromFilenames(newPlaylistName, inferredPlatform, filenames)
        if ('error' in r) { setError(r.error); setWorking(false); return }
      } else {
        const r = await api.addPlaylistEntries(playlistChoice, filenames)
        if (r.error) { setError(r.error); setWorking(false); return }
      }
    }

    setWorking(false)
    onComplete()
  }

  const canConfirm = !working &&
    (copyEnabled || playlistEnabled) &&
    !(playlistEnabled && playlistChoice === 'new' && newPlaylistName.trim().length === 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#2a2a2a', borderRadius: 8, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px' }}>
          Rescue {items.length} {items.length === 1 ? 'item' : 'items'}
        </h3>

        {/* Copy to Library */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={copyEnabled} onChange={e => setCopyEnabled(e.target.checked)} />
            Copy to Library
          </label>
          {copyEnabled && settings && (
            <div style={{ paddingLeft: 24 }}>
              {Array.from(groups.entries()).map(([platform, groupItems]) => (
                <div key={platform} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                    {platform} — {groupItems.length} {groupItems.length === 1 ? 'file' : 'files'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {destOverrides[platform] ?? `${settings.libraryPath}/${platform}`}
                    </span>
                    <button
                      onClick={() => handleFolderPick(platform)}
                      style={{ padding: '2px 8px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add to Playlist */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={playlistEnabled} onChange={e => setPlaylistEnabled(e.target.checked)} />
            Add to Playlist
          </label>
          {playlistEnabled && (
            <div style={{ paddingLeft: 24 }}>
              <select
                value={playlistChoice}
                onChange={e => setPlaylistChoice(e.target.value)}
                style={{ padding: '6px 8px', background: '#1e1e1e', color: '#fff', border: '1px solid #444', borderRadius: 4, width: '100%', marginBottom: 8 }}
              >
                {playlists.map(p => (
                  <option key={p.stem} value={p.stem}>{p.name}</option>
                ))}
                <option value="new">New playlist…</option>
              </select>
              {playlistChoice === 'new' && (
                <input
                  type="text"
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  style={{ padding: '6px 8px', background: '#1e1e1e', color: '#fff', border: '1px solid #444', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
                />
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: 10, background: '#f4433622', border: '1px solid #f44336', borderRadius: 4, marginBottom: 16, color: '#f44336', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={working}
            style={{ padding: '8px 16px', background: '#3a3a3a', color: '#ccc', border: 'none', borderRadius: 4, cursor: working ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ padding: '8px 16px', background: canConfirm ? '#4caf50' : '#555', color: '#fff', border: 'none', borderRadius: 4, cursor: canConfirm ? 'pointer' : 'default', fontWeight: 700 }}
          >
            {working ? 'Working…' : 'Rescue'}
          </button>
        </div>
      </div>
    </div>
  )
}
