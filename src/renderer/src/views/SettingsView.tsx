import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { AppConfig } from '@shared/types'

export function SettingsView(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSettings().then(setConfig)
  }, [])

  async function handleSave(): Promise<void> {
    if (!config) return
    const updated = await api.setSettings(config)
    setConfig(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!config) return <div>Loading...</div>

  return (
    <div>
      <h2>Settings</h2>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Library Path</label>
        <input
          type="text"
          value={config.libraryPath}
          onChange={(e) => setConfig({ ...config, libraryPath: e.target.value })}
          placeholder="/Volumes/ExternalSSD/Roms"
          style={{ width: 400, padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          Fuzzy Match Threshold: {config.fuzzyMatchThreshold.toFixed(2)}
        </label>
        <input
          type="range" min={0.1} max={1.0} step={0.05}
          value={config.fuzzyMatchThreshold}
          onChange={(e) => setConfig({ ...config, fuzzyMatchThreshold: parseFloat(e.target.value) })}
          style={{ width: 300 }}
        />
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Lower = stricter matching. Default: 0.6</div>
      </div>

      <button
        onClick={handleSave}
        style={{ padding: '8px 20px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        {saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  )
}
