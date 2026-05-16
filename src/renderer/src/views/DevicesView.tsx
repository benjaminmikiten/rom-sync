import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { MountedVolume, DeviceConfig } from '@shared/types'

interface DeviceDetail {
  volume: MountedVolume
  config: DeviceConfig | null
  configError: string | null
}

interface PlatformRow {
  id: number
  platform: string
  path: string | null   // full Mac path; null = derive from romsRoot + platform at submit
}

function fmt(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

function toYamlPath(fullPath: string, mountPoint: string): string {
  return fullPath.startsWith(mountPoint) ? fullPath.slice(mountPoint.length) : fullPath
}

export function DevicesView(): React.JSX.Element {
  const [volumes, setVolumes] = useState<MountedVolume[]>([])
  const [selected, setSelected] = useState<DeviceDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const nextRowId = React.useRef(1)
  const [deviceName, setDeviceName] = useState('')
  const [romsRoot, setRomsRoot] = useState<string | null>(null)
  const [platformRows, setPlatformRows] = useState<PlatformRow[]>([{ id: 0, platform: '', path: null }])
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [availablePlaylists, setAvailablePlaylists] = useState<Array<{ stem: string; name: string }>>([])
  const [playlistSaveError, setPlaylistSaveError] = useState<string | null>(null)
  const [importPlatform, setImportPlatform] = useState<string | null>(null)
  const [importName, setImportName] = useState('')
  const [importResult, setImportResult] = useState<{ stem: string } | { error: string } | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => { api.listDevices().then(setVolumes) }, [])

  async function handleSelect(vol: MountedVolume): Promise<void> {
    setLoading(true)
    const { config, error } = await api.readDeviceConfig(vol.mountPoint)
    setSelected({ volume: vol, config, configError: error })
    setDeviceName(vol.name)
    setRomsRoot(null)
    setPlatformRows([{ id: nextRowId.current++, platform: '', path: null }])
    setCreateError(null)
    setPlaylistSaveError(null)
    const plResults = await api.listPlaylists()
    setAvailablePlaylists(
      plResults
        .filter((r) => r.playlist !== null)
        .map((r) => ({ stem: r.playlist!.stem, name: r.playlist!.name }))
    )
    setLoading(false)
  }

  async function handlePickRoot(): Promise<void> {
    const picked = await api.openFolderPicker()
    if (!picked) return
    setRomsRoot(picked)
    const subdirs = await api.listSubdirs(picked)
    if (subdirs.length > 0) {
      setPlatformRows(subdirs.map((name) => ({
        id: nextRowId.current++,
        platform: name.toLowerCase(),
        path: `${picked}/${name}`
      })))
    } else {
      setPlatformRows([{ id: nextRowId.current++, platform: '', path: null }])
    }
  }

  async function handleChangeRowFolder(rowId: number): Promise<void> {
    const picked = await api.openFolderPicker()
    if (!picked) return
    setPlatformRows((rows) => rows.map((r) => r.id === rowId ? { ...r, path: picked } : r))
  }

  function handleAddRow(): void {
    setPlatformRows((rows) => [...rows, { id: nextRowId.current++, platform: '', path: null }])
  }

  function handleRemoveRow(rowId: number): void {
    setPlatformRows((rows) => rows.filter((r) => r.id !== rowId))
  }

  function handlePlatformChange(rowId: number, value: string): void {
    setPlatformRows((rows) => rows.map((r) => r.id === rowId ? { ...r, platform: value } : r))
  }

  async function handleCreate(): Promise<void> {
    if (!selected) return
    const mountPoint = selected.volume.mountPoint
    const platforms: Record<string, string> = {}
    const seen = new Set<string>()
    for (const row of platformRows) {
      const code = row.platform.trim()
      if (!code || seen.has(code)) continue
      seen.add(code)
      if (row.path) {
        platforms[code] = toYamlPath(row.path, mountPoint)
      } else if (romsRoot) {
        platforms[code] = toYamlPath(`${romsRoot}/${code}`, mountPoint)
      }
    }
    if (Object.keys(platforms).length === 0) return
    setCreating(true)
    setCreateError(null)
    const result = await api.writeDeviceConfig(mountPoint, {
      deviceName: deviceName.trim(),
      platforms,
      playlists: []
    })
    if (result.error) {
      setCreateError(result.error)
      setCreating(false)
      return
    }
    const { config, error } = await api.readDeviceConfig(mountPoint)
    setSelected({ volume: selected.volume, config, configError: error })
    setCreating(false)
  }

  async function handleTogglePlaylist(stem: string): Promise<void> {
    if (!selected?.config) return
    const current = selected.config.playlists
    const updated = current.includes(stem)
      ? current.filter((s) => s !== stem)
      : [...current, stem]
    const result = await api.writeDeviceConfig(selected.volume.mountPoint, {
      ...selected.config,
      playlists: updated
    })
    if (result.error) {
      setPlaylistSaveError(result.error)
      return
    }
    setPlaylistSaveError(null)
    setSelected((prev) =>
      prev ? { ...prev, config: prev.config ? { ...prev.config, playlists: updated } : null } : null
    )
  }

  function handleOpenImport(platform: string): void {
    setImportPlatform(platform)
    setImportName(platform.toUpperCase())
    setImportResult(null)
  }

  async function handleImport(): Promise<void> {
    if (!selected?.config || !importPlatform || !importName.trim()) return
    setImporting(true)
    setImportResult(null)
    const result = await api.importPlaylistFromDevice(
      selected.volume.mountPoint,
      importPlatform,
      importName
    )
    setImportResult(result)
    setImporting(false)
  }

  const canCreate =
    selected !== null &&
    deviceName.trim().length > 0 &&
    platformRows.some((r) =>
      r.platform.trim().length > 0 && (r.path !== null || romsRoot !== null)
    )

  if (selected) {
    const isMissingConfig =
      selected.config === null &&
      selected.configError === 'rom-sync.yaml not found on this volume'
    const mountPoint = selected.volume.mountPoint

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
          <h2 style={{ margin: 0 }}>{selected.volume.name}</h2>
        </div>

        {selected.configError && !isMissingConfig && (
          <div style={{ padding: 12, background: '#f4433622', border: '1px solid #f44336', borderRadius: 6, marginBottom: 16, color: '#f44336' }}>
            {selected.configError}
          </div>
        )}

        {isMissingConfig && (
          <div>
            <p style={{ color: '#888', marginBottom: 20, fontSize: 13 }}>
              This volume has no <code style={{ background: '#2a2a2a', padding: '1px 5px', borderRadius: 3 }}>rom-sync.yaml</code>. Fill in the details below to set it up.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#ccc', fontSize: 13 }}>Device Name</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="My Anbernic Card"
                style={{ width: 300, padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#ccc', fontSize: 13 }}>ROMs Root Folder</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {romsRoot ? (
                  <>
                    <span style={{ fontSize: 13, color: '#aaa' }}>{toYamlPath(romsRoot, mountPoint)}</span>
                    <button
                      onClick={handlePickRoot}
                      style={{ padding: '4px 10px', background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                    >Change</button>
                  </>
                ) : (
                  <button
                    onClick={handlePickRoot}
                    style={{ padding: '7px 14px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
                  >Pick Folder…</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, color: '#ccc', fontSize: 13 }}>Platforms</label>
              {platformRows.map((row, i) => {
                const previewPath = row.path
                  ? toYamlPath(row.path, mountPoint)
                  : romsRoot && row.platform.trim()
                    ? toYamlPath(`${romsRoot}/${row.platform.trim()}`, mountPoint)
                    : null

                return (
                  <div key={row.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={row.platform}
                      onChange={(e) => handlePlatformChange(row.id, e.target.value)}
                      placeholder="gba"
                      style={{ width: 80, padding: '6px 8px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, fontSize: 13 }}
                    />
                    <span style={{ color: '#555' }}>→</span>
                    <span style={{
                      fontSize: 13,
                      color: row.path ? '#aaa' : '#555',
                      minWidth: 180,
                      fontStyle: row.path ? 'normal' : 'italic'
                    }}>
                      {previewPath ?? '(pick a folder)'}
                    </span>
                    <button
                      onClick={() => handleChangeRowFolder(row.id)}
                      style={{ padding: '4px 10px', background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                    >
                      {row.path ? 'Change' : 'Pick…'}
                    </button>
                    {platformRows.length > 1 && (
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                      >×</button>
                    )}
                  </div>
                )
              })}
              <button
                onClick={handleAddRow}
                style={{ marginTop: 4, padding: '4px 12px', background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                + Add Platform
              </button>
            </div>

            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              style={{
                padding: '8px 20px',
                background: canCreate && !creating ? '#4a9eff' : '#2a2a2a',
                color: canCreate && !creating ? '#fff' : '#555',
                border: 'none', borderRadius: 4,
                cursor: canCreate && !creating ? 'pointer' : 'default'
              }}
            >
              {creating ? 'Creating…' : 'Create Config'}
            </button>

            {createError && (
              <div style={{ marginTop: 12, color: '#f44336', fontSize: 13 }}>{createError}</div>
            )}
          </div>
        )}

        {selected.config && (
          <div>
            <p><strong>Device Name:</strong> {selected.config.deviceName}</p>
            <p><strong>Available:</strong> {fmt(selected.volume.availableBytes)} / {fmt(selected.volume.totalBytes)}</p>
            <h3>Platform Mappings</h3>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '4px 16px 4px 0' }}>Platform</th>
                  <th style={{ padding: '4px 16px 4px 0' }}>Path on Card</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(selected.config.platforms).map(([platform, path]) => (
                  <React.Fragment key={platform}>
                    <tr>
                      <td style={{ padding: '4px 16px 4px 0', fontWeight: 600 }}>{platform}</td>
                      <td style={{ padding: '4px 16px 4px 0', color: '#aaa' }}>{path}</td>
                      <td>
                        <button
                          onClick={() =>
                            importPlatform === platform
                              ? setImportPlatform(null)
                              : handleOpenImport(platform)
                          }
                          style={{ padding: '3px 10px', background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          {importPlatform === platform ? 'Cancel' : 'Import as playlist'}
                        </button>
                      </td>
                    </tr>
                    {importPlatform === platform && (
                      <tr>
                        <td colSpan={3} style={{ paddingBottom: 12 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                            <input
                              value={importName}
                              onChange={(e) => setImportName(e.target.value)}
                              placeholder="Playlist name"
                              style={{ padding: '6px 8px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, fontSize: 13, width: 200 }}
                            />
                            <button
                              onClick={handleImport}
                              disabled={importing || !importName.trim()}
                              style={{
                                padding: '6px 14px',
                                background: importing || !importName.trim() ? '#2a2a2a' : '#4a9eff',
                                color: importing || !importName.trim() ? '#555' : '#fff',
                                border: 'none', borderRadius: 4,
                                cursor: importing || !importName.trim() ? 'default' : 'pointer',
                                fontSize: 13
                              }}
                            >
                              {importing ? 'Creating…' : 'Create'}
                            </button>
                          </div>
                          {importResult && 'error' in importResult && (
                            <div style={{ color: '#f44336', fontSize: 12, marginTop: 6 }}>{importResult.error}</div>
                          )}
                          {importResult && 'stem' in importResult && (
                            <div style={{ color: '#4caf50', fontSize: 12, marginTop: 6 }}>
                              Playlist &lsquo;{importResult.stem}&rsquo; created — assign it to this device in the Playlists section below.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: '0 0 12px' }}>Playlists</h3>
              {availablePlaylists.length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>No playlists yet — create some in the Playlists tab.</p>
              ) : (
                availablePlaylists.map(({ stem, name }) => (
                  <label key={stem} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected.config!.playlists.includes(stem)}
                      onChange={() => handleTogglePlaylist(stem)}
                    />
                    <span style={{ fontSize: 13 }}>{name}</span>
                  </label>
                ))
              )}
              {playlistSaveError && (
                <div style={{ color: '#f44336', fontSize: 13, marginTop: 8 }}>{playlistSaveError}</div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Devices</h2>
        <button
          onClick={() => api.listDevices().then(setVolumes)}
          style={{ padding: '6px 16px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {volumes.length === 0 && <p style={{ color: '#666' }}>No external volumes mounted.</p>}

      {volumes.map((vol) => (
        <div
          key={vol.mountPoint}
          onClick={() => handleSelect(vol)}
          style={{ padding: '12px 16px', marginBottom: 8, background: '#1e1e1e', borderRadius: 6, cursor: 'pointer', border: '1px solid #2a2a2a' }}
        >
          <span style={{ fontWeight: 600 }}>{vol.name}</span>
          <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
            {fmt(vol.availableBytes)} free / {fmt(vol.totalBytes)} total
          </span>
        </div>
      ))}

      {loading && <p style={{ color: '#888' }}>Loading device config…</p>}
    </div>
  )
}
