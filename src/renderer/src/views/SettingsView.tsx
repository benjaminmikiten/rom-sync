import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { AppConfig } from '@shared/types'

const PLAYLIST_PROMPT = `You are helping me build ROM playlists for the ROM Sync app.

## Playlist YAML Schema

Single-platform playlist:
\`\`\`yaml
name: My GBA Favorites
platform: gba
entries:
  - Castlevania - Aria of Sorrow
  - Final Fantasy VI Advance
  - Metroid Fusion
includes:
  - another-playlist-stem   # optional: merge entries from another playlist
\`\`\`

Cross-platform playlist (omit top-level platform; entries is a platform-keyed map):
\`\`\`yaml
name: All-Time Favorites
entries:
  snes:
    - Chrono Trigger
    - Super Metroid
  gba:
    - Castlevania - Aria of Sorrow
    - Metroid Fusion
  nds:
    - Castlevania - Dawn of Sorrow
\`\`\`

## Rules
- \`name\`: Human-readable display name
- \`platform\`: lowercase platform code (gba, snes, gbc, nds, psx, genesis, etc.)
- \`entries\`: List of game titles. Use the common English title without region tags, e.g. "Super Mario World" not "Super Mario World (USA)"
- \`includes\`: Optional list of other playlist stems (filename without .yaml) to merge in
- Filename becomes the playlist stem, e.g. \`gba-favorites.yaml\` => stem is \`gba-favorites\`

## Task
Based on the games I describe, generate a valid YAML playlist file. Ask me what platform and theme I want, then suggest games and format them correctly.`

export function SettingsView(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)

  useEffect(() => {
    void api.getSettings().then(setConfig)
  }, [])

  async function handleSave(): Promise<void> {
    if (!config) return
    const updated = await api.setSettings(config)
    setConfig(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handlePickFolder(): Promise<void> {
    const path = await api.openFolderPicker()
    if (path && config) setConfig({ ...config, libraryPath: path })
  }

  async function handleCleanup(): Promise<void> {
    const { removed } = await api.cleanupDotfiles()
    setCleanupResult(`Removed ${removed} dotfile${removed !== 1 ? 's' : ''}`)
    setTimeout(() => setCleanupResult(null), 4000)
  }

  function handleCopyPrompt(): void {
    void navigator.clipboard.writeText(PLAYLIST_PROMPT)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2000)
  }

  if (!config) return <div style={{ padding: 24, color: '#fff' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginBottom: 24 }}>Settings</h2>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 6, color: '#ccc' }}>Library Path</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={config.libraryPath}
            onChange={(e) => setConfig({ ...config, libraryPath: e.target.value })}
            placeholder="/Volumes/ExternalSSD/Roms"
            style={{ flex: 1, padding: 8, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4 }}
          />
          <button
            onClick={() => { void handlePickFolder() }}
            style={{ padding: '8px 14px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Browse…
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', marginBottom: 6, color: '#ccc' }}>
          Fuzzy Match Threshold: {config.fuzzyMatchThreshold.toFixed(2)}
        </label>
        <input
          type="range" min={0.1} max={1.0} step={0.05}
          value={config.fuzzyMatchThreshold}
          onChange={(e) => setConfig({ ...config, fuzzyMatchThreshold: parseFloat(e.target.value) })}
          style={{ width: 300 }}
        />
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Lower = stricter matching. Default: 0.6</div>
      </div>

      <button
        onClick={() => { void handleSave() }}
        style={{ padding: '8px 20px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 40 }}
      >
        {saved ? 'Saved!' : 'Save'}
      </button>

      <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', marginBottom: 32 }} />

      <h3 style={{ marginBottom: 16, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Utilities</h3>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Clean Up Dotfiles</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
          Removes <code style={{ background: '#2a2a2a', padding: '1px 5px', borderRadius: 3 }}>._</code> and{' '}
          <code style={{ background: '#2a2a2a', padding: '1px 5px', borderRadius: 3 }}>.DS_Store</code> files from your ROM library directories.
        </div>
        <button
          onClick={() => { void handleCleanup() }}
          style={{ padding: '7px 16px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
        >
          Run Cleanup
        </button>
        {cleanupResult && <span style={{ marginLeft: 12, fontSize: 13, color: '#4caf50' }}>{cleanupResult}</span>}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Build Playlists with AI</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
          Copy this prompt into any LLM (Claude, ChatGPT, etc.) to get help building playlist YAML files.
        </div>
        <pre style={{
          background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
          padding: 16, fontSize: 12, color: '#aaa', whiteSpace: 'pre-wrap',
          maxHeight: 200, overflowY: 'auto', marginBottom: 10, fontFamily: 'monospace'
        }}>
          {PLAYLIST_PROMPT}
        </pre>
        <button
          onClick={handleCopyPrompt}
          style={{
            padding: '7px 16px',
            background: promptCopied ? '#1e3a1e' : '#3a3a3a',
            color: promptCopied ? '#4caf50' : '#ccc',
            border: '1px solid #555', borderRadius: 4, cursor: 'pointer'
          }}
        >
          {promptCopied ? 'Copied!' : 'Copy Prompt'}
        </button>
      </div>
    </div>
  )
}
