import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { PlaylistEditor } from '../components/PlaylistEditor'
import type { Playlist, ValidationIssue } from '@shared/types'

interface LoadedPlaylist {
  valid: boolean
  playlist: Playlist | null
  issues: ValidationIssue[]
}

export function PlaylistsView(): React.JSX.Element {
  const [playlists, setPlaylists] = useState<LoadedPlaylist[]>([])
  const [selected, setSelected] = useState<Playlist | null>(null)

  const load = useCallback(async () => {
    const results = await api.listPlaylists()
    setPlaylists(results)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const unsub = api.onPlaylistsChanged(load); return unsub }, [load])

  if (selected) {
    return <PlaylistEditor stem={selected.stem} name={selected.name} onClose={() => setSelected(null)} />
  }

  return (
    <div>
      <h2>Playlists</h2>

      {playlists.length === 0 && (
        <p style={{ color: '#666' }}>
          No playlists found. Add .yaml files to ~/Library/Application Support/rom-sync/playlists/
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
