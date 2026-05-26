import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { MatchResult } from '@shared/types'

interface Props {
  stem: string
  name: string
  filePath: string
  onClose: () => void
}

const STATUS_COLOR: Record<string, string> = { exact: '#4caf50', fuzzy: '#ff9800', none: '#f44336' }
const STATUS_LABEL: Record<string, string> = { exact: 'Exact', fuzzy: 'Fuzzy', none: 'Not found' }

export function PlaylistEditor({ stem, name, filePath, onClose }: Props): React.JSX.Element {
  const [matches, setMatches] = useState<MatchResult[] | null>(null)

  useEffect(() => {
    api.matchPlaylist(stem).then(setMatches)
  }, [stem])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={onClose} style={{ background: 'none', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
        <h2 style={{ margin: 0 }}>{name}</h2>
        <button
          onClick={() => api.openPlaylistFile(filePath)}
          style={{ marginLeft: 'auto', padding: '6px 14px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
        >
          Open in Editor
        </button>
      </div>

      {!matches && <p>Loading matches…</p>}

      {matches && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px' }}>Entry</th>
              <th style={{ padding: '4px 8px' }}>Platform</th>
              <th style={{ padding: '4px 8px' }}>Status</th>
              <th style={{ padding: '4px 8px' }}>Matched File</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i} style={{ borderTop: '1px solid #2a2a2a' }}>
                <td style={{ padding: '4px 8px' }}>{m.entry.raw}</td>
                <td style={{ padding: '4px 8px', color: '#888' }}>
                  {Array.isArray(m.entry.platform) ? m.entry.platform.join(' / ') : m.entry.platform}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 11,
                    background: STATUS_COLOR[m.status] + '33',
                    color: STATUS_COLOR[m.status]
                  }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td style={{ padding: '4px 8px', color: '#aaa' }}>
                  {m.rom ? m.rom.filename : <span style={{ color: '#666' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
