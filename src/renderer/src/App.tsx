import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { LibraryView } from './views/LibraryView'
import { PlaylistsView } from './views/PlaylistsView'
import { DevicesView } from './views/DevicesView'
import { SyncView } from './views/SyncView'
import { SettingsView } from './views/SettingsView'

type View = 'library' | 'playlists' | 'devices' | 'sync' | 'settings'

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>('library')

  const content: Record<View, React.JSX.Element> = {
    library: <LibraryView />,
    playlists: <PlaylistsView />,
    devices: <DevicesView />,
    sync: <SyncView />,
    settings: <SettingsView />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar active={view} onChange={setView} />
      <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: '#121212', color: '#fff' }}>
        {content[view]}
      </main>
    </div>
  )
}
