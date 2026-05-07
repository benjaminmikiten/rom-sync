import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { PlaylistEditor } from '../components/PlaylistEditor'
import type { Playlist, ValidationIssue } from '@shared/types'

interface LoadedPlaylist {
  valid: boolean
  playlist: Playlist | null
  issues: ValidationIssue[]
}

const PLATFORMS = ['gba', 'gbc', 'gb', 'snes', 'nes', 'nds', 'n64', 'gbc', 'genesis', 'psx', 'psp', 'msx', 'other']

export function PlaylistsView(): React.JSX.Element {
  const [playlists, setPlaylists] = useState<LoadedPlaylist[]>([])
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlatform, setNewPlatform] = useState('gba')
  const [newEntries, setNewEntries] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const results = await api.listPlaylists()
    setPlaylists(results)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const unsub = api.onPlaylistsChanged(load); return unsub }, [load])

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) { setCreateError('Name is required'); return }
    setCreateError(null)
    await api.createPlaylist(newName.trim(), newPlatform, newEntries)
    setCreating(false)
    setNewName('')
    setNewEntries('')
  }

  if (selected) {
    return <PlaylistEditor stem={selected.stem} name={selected.name} onClose={() => setSelected(null)} />
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Playlists</h2>
        <button
          onClick={() => setCreating(!creating)}
          style={{ padding: '6px 14px', background: creating ? '#3a3a3a' : '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
        >
          {creating ? 'Cancel' : '+ New Playlist'}
        </button>
        <button
          onClick={() => api.openPlaylistsFolder()}
          style={{ padding: '6px 14px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
        >
          Open Folder
        </button>
      </div>

      {creating && (
        <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14 }}>New Playlist</h3>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="GBA Favorites"
                style={{ width: '100%', padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Platform</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                style={{ padding: '8px 10px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>
              Game Titles <span style={{ color: '#555' }}>(one per line)</span>
            </label>
            <textarea
              value={newEntries}
              onChange={(e) => setNewEntries(e.target.value)}
              placeholder={'Super Mario World\nChrono Trigger\nFinal Fantasy VI'}
              rows={6}
              style={{ width: '100%', padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
          {createError && <div style={{ color: '#f44336', fontSize: 13, marginBottom: 8 }}>{createError}</div>}
          <button
            onClick={handleCreate}
            style={{ padding: '8px 20px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Create Playlist
          </button>
        </div>
      )}

      {playlists.length === 0 && !creating && (
        <p style={{ color: '#666' }}>
          No playlists yet. Click "+ New Playlist" to create one, or "Open Folder" to add YAML files manually.
        </p>
      )}

      {playlists.map((result, i) => {
        const pl = result.playlist
        return (
          <div
            key={i}
            onClick={() => pl && setSelected(pl)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', marginBottom: 8,
              background: '#1e1e1e', borderRadius: 6,
              cursor: pl ? 'pointer' : 'default',
              border: result.valid ? '1px solid #2a2a2a' : '1px solid #f4433666'
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>{pl?.name ?? `(invalid playlist ${i})`}</span>
              {pl && (
                <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
                  {pl.platform ? pl.platform.toUpperCase() : 'cross-platform'} · {pl.entries.length} entries
                </span>
              )}
            </div>
            {!result.valid && (
              <span style={{ color: '#f44336', fontSize: 12 }}>
                ⚠ {result.issues[0]?.message ?? 'Invalid'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
