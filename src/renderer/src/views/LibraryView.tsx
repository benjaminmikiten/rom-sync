import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import type { Rom } from '@shared/types'

export function LibraryView(): React.JSX.Element {
  const [roms, setRoms] = useState<Rom[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [search, setSearch] = useState('')
  const [lastScanned, setLastScanned] = useState<number | null>(null)

  const load = useCallback(async () => {
    const all = await api.getRoms()
    setRoms(all)
    if (all.length > 0) setLastScanned(Math.max(...all.map((r) => r.scannedAt)))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const unsub = api.onScanProgress((p) => setScanCount(p.current))
    return unsub
  }, [])

  async function handleScan(): Promise<void> {
    setScanning(true)
    setScanCount(0)
    await api.scanLibrary()
    await load()
    setScanning(false)
  }

  const filtered = roms.filter((r) =>
    search === '' ||
    r.title.includes(search.toLowerCase()) ||
    r.filename.toLowerCase().includes(search.toLowerCase())
  )

  const byPlatform = new Map<string, Rom[]>()
  for (const rom of filtered) {
    const list = byPlatform.get(rom.platform) ?? []
    list.push(rom)
    byPlatform.set(rom.platform, list)
  }
  const platforms = [...byPlatform.keys()].sort()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Library</h2>
        <button
          onClick={handleScan} disabled={scanning}
          style={{ padding: '6px 16px', background: scanning ? '#444' : '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: scanning ? 'default' : 'pointer' }}
        >
          {scanning ? `Scanning… (${scanCount})` : 'Rescan Library'}
        </button>
        {lastScanned && (
          <span style={{ fontSize: 12, color: '#888' }}>
            Last scanned: {new Date(lastScanned * 1000).toLocaleString()}
          </span>
        )}
      </div>

      <input
        type="text" value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ROMs…"
        style={{ width: 300, padding: 8, marginBottom: 20, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
      />

      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{roms.length} ROMs indexed</div>

      {platforms.map((platform) => {
        const platformRoms = byPlatform.get(platform)!
        return (
          <details key={platform} style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600, padding: '6px 0' }}>
              {platform.toUpperCase()} — {platformRoms.length} ROMs
            </summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Filename</th>
                  <th style={{ padding: '4px 8px' }}>Title</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {platformRoms.map((rom) => (
                  <tr key={rom.id} style={{ borderTop: '1px solid #2a2a2a' }}>
                    <td style={{ padding: '4px 8px' }}>{rom.filename}</td>
                    <td style={{ padding: '4px 8px', color: '#aaa' }}>{rom.title}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#666' }}>
                      {(rom.sizeBytes / 1_048_576).toFixed(1)} MB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )
      })}

      {platforms.length === 0 && !scanning && (
        <p style={{ color: '#666' }}>No ROMs indexed. Set your library path in Settings and click Rescan.</p>
      )}
    </div>
  )
}
