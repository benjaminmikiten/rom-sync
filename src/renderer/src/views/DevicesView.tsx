import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { MountedVolume, DeviceConfig } from '@shared/types'

interface DeviceDetail {
  volume: MountedVolume
  config: DeviceConfig | null
  configError: string | null
}

function fmt(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

export function DevicesView(): React.JSX.Element {
  const [volumes, setVolumes] = useState<MountedVolume[]>([])
  const [selected, setSelected] = useState<DeviceDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.listDevices().then(setVolumes) }, [])

  async function handleSelect(vol: MountedVolume): Promise<void> {
    setLoading(true)
    const { config, error } = await api.readDeviceConfig(vol.mountPoint)
    setSelected({ volume: vol, config, configError: error })
    setLoading(false)
  }

  if (selected) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
          <h2 style={{ margin: 0 }}>{selected.volume.name}</h2>
        </div>

        {selected.configError && (
          <div style={{ padding: 12, background: '#f4433622', border: '1px solid #f44336', borderRadius: 6, marginBottom: 16, color: '#f44336' }}>
            {selected.configError}
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
                  <th>Path on Card</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(selected.config.platforms).map(([platform, path]) => (
                  <tr key={platform}>
                    <td style={{ padding: '4px 16px 4px 0', fontWeight: 600 }}>{platform}</td>
                    <td style={{ color: '#aaa' }}>{path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
