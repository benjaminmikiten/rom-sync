import React from 'react'

type View = 'library' | 'playlists' | 'devices' | 'sync' | 'settings'

interface Props {
  active: View
  onChange: (view: View) => void
}

const NAV_ITEMS: { id: View; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'devices', label: 'Devices' },
  { id: 'sync', label: 'Sync' },
  { id: 'settings', label: 'Settings' }
]

export function Sidebar({ active, onChange }: Props): React.JSX.Element {
  return (
    <nav style={{ width: 180, minHeight: '100vh', background: '#1e1e1e', padding: '24px 0' }}>
      <div style={{ padding: '0 16px 24px', color: '#fff', fontWeight: 700, fontSize: 16 }}>
        ROM Sync
      </div>
      {NAV_ITEMS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            display: 'block', width: '100%', padding: '10px 16px',
            background: active === id ? '#3a3a3a' : 'transparent',
            color: active === id ? '#fff' : '#aaa',
            border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
