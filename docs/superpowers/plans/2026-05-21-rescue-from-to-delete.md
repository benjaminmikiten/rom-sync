# Rescue from To Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select rescue actions to the "To Delete" panel in the Sync preview, letting users copy device files into their master library and/or add them to a playlist before the sync runs.

**Architecture:** A new `rescue.ts` backend module handles file-copy and playlist-mutation logic; three new IPC handlers wire it to the renderer. `SyncPreview.tsx` gains checkbox selection and a toolbar button that opens a new `RescueModal.tsx` overlay. On confirm, the modal calls the IPC methods and triggers a preview re-run via an `onRescueComplete` callback.

**Tech Stack:** Electron IPC, React 18, vitest, js-yaml, Node `fs`

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Create | `src/main/rescue.ts` | `copyFilesFromDevice`, `addEntriesToPlaylist`, `createPlaylistFromFilenames` |
| Create | `tests/rescue.test.ts` | Unit tests for all three rescue functions |
| Modify | `src/main/ipc.ts` | Three new IPC handlers; import rescue functions |
| Modify | `src/preload/index.ts` | Expose three new IPC methods |
| Modify | `src/renderer/src/api.ts` | Add three new method types |
| Modify | `src/renderer/src/components/SyncPreview.tsx` | Selection state, checkboxes, rescue toolbar |
| Create | `src/renderer/src/components/RescueModal.tsx` | Rescue confirmation modal |
| Modify | `src/renderer/src/views/SyncView.tsx` | Pass `onRescueComplete` callback to `SyncPreviewPanel` |

---

## Task 1: Backend rescue module (TDD)

**Files:**
- Create: `src/main/rescue.ts`
- Create: `tests/rescue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/rescue.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { copyFilesFromDevice, addEntriesToPlaylist, createPlaylistFromFilenames } from '../src/main/rescue'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let srcDir: string
let destDir: string
let playlistsDir: string

beforeEach(() => {
  srcDir = mkdtempSync(join(tmpdir(), 'rescue-src-'))
  destDir = mkdtempSync(join(tmpdir(), 'rescue-dst-'))
  playlistsDir = mkdtempSync(join(tmpdir(), 'rescue-pl-'))
})

afterEach(() => {
  rmSync(srcDir, { recursive: true })
  rmSync(destDir, { recursive: true })
  rmSync(playlistsDir, { recursive: true })
})

describe('copyFilesFromDevice', () => {
  it('copies a file to the destination', () => {
    writeFileSync(join(srcDir, 'Game.gba'), 'content')
    const dest = join(destDir, 'Game.gba')
    const result = copyFilesFromDevice([{ src: join(srcDir, 'Game.gba'), dest }])
    expect(result.copied).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(existsSync(dest)).toBe(true)
  })

  it('creates destination directories if they do not exist', () => {
    writeFileSync(join(srcDir, 'Game.gba'), 'content')
    const dest = join(destDir, 'deep', 'nested', 'Game.gba')
    copyFilesFromDevice([{ src: join(srcDir, 'Game.gba'), dest }])
    expect(existsSync(dest)).toBe(true)
  })

  it('records an error and continues when a source file is missing', () => {
    writeFileSync(join(srcDir, 'Good.gba'), 'content')
    const result = copyFilesFromDevice([
      { src: join(srcDir, 'Missing.gba'), dest: join(destDir, 'Missing.gba') },
      { src: join(srcDir, 'Good.gba'), dest: join(destDir, 'Good.gba') }
    ])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Missing.gba')
    expect(result.copied).toBe(1)
  })

  it('returns zero copied and empty errors for an empty pairs list', () => {
    const result = copyFilesFromDevice([])
    expect(result.copied).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})

describe('addEntriesToPlaylist', () => {
  it('appends normalized filenames to an existing playlist', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby'
    ].join('\n'))

    const result = addEntriesToPlaylist(playlistsDir, 'gba', ['Pokemon Emerald Seaglass (USA).gba'])
    expect(result).toEqual({ error: null })
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    expect(content).toContain('pokemon ruby')
    expect(content).toContain('pokemon emerald seaglass')
  })

  it('does not duplicate entries already in the playlist', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby'
    ].join('\n'))

    addEntriesToPlaylist(playlistsDir, 'gba', ['Pokemon Ruby (USA).gba'])
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    const matches = content.match(/pokemon ruby/g)
    expect(matches).toHaveLength(1)
  })

  it('returns error when the playlist stem does not exist', () => {
    const result = addEntriesToPlaylist(playlistsDir, 'nonexistent', ['Game.gba'])
    expect(result.error).toContain('nonexistent')
  })

  it('preserves existing entries when adding new ones', () => {
    writeFileSync(join(playlistsDir, 'gba.yaml'), [
      'name: GBA Games',
      'platform: gba',
      'entries:',
      '  - pokemon ruby',
      '  - mario kart'
    ].join('\n'))

    addEntriesToPlaylist(playlistsDir, 'gba', ['Kirby (USA).gba'])
    const content = readFileSync(join(playlistsDir, 'gba.yaml'), 'utf-8')
    expect(content).toContain('pokemon ruby')
    expect(content).toContain('mario kart')
    expect(content).toContain('kirby')
  })
})

describe('createPlaylistFromFilenames', () => {
  it('creates a new playlist YAML with normalized entries', () => {
    const result = createPlaylistFromFilenames(
      playlistsDir, 'GBA Finds', 'gba',
      ['Pokemon Emerald Seaglass (USA).gba', 'Mario Kart (Europe).gba']
    )
    expect(result).toEqual({ stem: 'gba-finds' })
    const content = readFileSync(join(playlistsDir, 'gba-finds.yaml'), 'utf-8')
    expect(content).toContain('name: GBA Finds')
    expect(content).toContain('platform: gba')
    expect(content).toContain('pokemon emerald seaglass')
    expect(content).toContain('mario kart')
  })

  it('omits the platform line when platform is empty', () => {
    createPlaylistFromFilenames(playlistsDir, 'Mixed Finds', '', ['Game.gba'])
    const content = readFileSync(join(playlistsDir, 'mixed-finds.yaml'), 'utf-8')
    expect(content).not.toContain('platform:')
  })

  it('deduplicates entries that normalize to the same title', () => {
    createPlaylistFromFilenames(
      playlistsDir, 'GBA Finds', 'gba',
      ['Game (USA).gba', 'Game (Europe).gba']
    )
    const content = readFileSync(join(playlistsDir, 'gba-finds.yaml'), 'utf-8')
    const entryLines = content.split('\n').filter(l => l.startsWith('  - '))
    expect(entryLines).toHaveLength(1)
  })

  it('returns error when name is empty', () => {
    const result = createPlaylistFromFilenames(playlistsDir, '   ', 'gba', ['Game.gba'])
    expect(result).toHaveProperty('error')
  })

  it('returns error when a playlist with that stem already exists', () => {
    writeFileSync(join(playlistsDir, 'gba-finds.yaml'), 'existing')
    const result = createPlaylistFromFilenames(playlistsDir, 'GBA Finds', 'gba', ['Game.gba'])
    expect(result).toHaveProperty('error')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/rescue.test.ts
```

Expected: `FAIL — Cannot find module '../src/main/rescue'`

- [ ] **Step 3: Implement `src/main/rescue.ts`**

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import yaml from 'js-yaml'
import { normalizeTitle } from './normalizer'

export function copyFilesFromDevice(
  pairs: { src: string; dest: string }[]
): { copied: number; errors: string[] } {
  const errors: string[] = []
  let copied = 0
  for (const { src, dest } of pairs) {
    try {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied++
    } catch (e: unknown) {
      errors.push(`Failed to copy ${src}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { copied, errors }
}

export function addEntriesToPlaylist(
  playlistsDir: string,
  stem: string,
  filenames: string[]
): { error: string | null } {
  const filePath = join(playlistsDir, `${stem}.yaml`)
  if (!existsSync(filePath)) return { error: `Playlist '${stem}' not found` }

  let raw: unknown
  try {
    raw = yaml.load(readFileSync(filePath, 'utf-8'))
  } catch (e: unknown) {
    return { error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!raw || typeof raw !== 'object') return { error: 'Playlist file is empty or invalid' }

  const doc = raw as Record<string, unknown>
  const existing: string[] = Array.isArray(doc['entries'])
    ? (doc['entries'] as unknown[]).filter((e): e is string => typeof e === 'string')
    : []

  const existingSet = new Set(existing)
  const normalized = filenames.map(f => normalizeTitle(f)).filter(Boolean)
  const toAdd = normalized.filter(e => !existingSet.has(e))
  doc['entries'] = [...existing, ...toAdd]

  try {
    writeFileSync(filePath, yaml.dump(doc))
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export function createPlaylistFromFilenames(
  playlistsDir: string,
  name: string,
  platform: string,
  filenames: string[]
): { stem: string } | { error: string } {
  const trimmedName = name.trim()
  const stem = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!stem) return { error: 'Name must contain at least one letter or number' }

  const yamlPath = join(playlistsDir, `${stem}.yaml`)
  if (existsSync(yamlPath)) return { error: 'A playlist with that name already exists' }

  const entries = [...new Set(filenames.map(f => normalizeTitle(f)).filter(Boolean))]
  const lines = [
    `name: ${trimmedName}`,
    platform ? `platform: ${platform}` : null,
    'entries:',
    ...entries.map(e => `  - ${e}`)
  ].filter((l): l is string => l !== null)

  try {
    mkdirSync(playlistsDir, { recursive: true })
    writeFileSync(yamlPath, lines.join('\n') + '\n')
    return { stem }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/rescue.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/rescue.ts tests/rescue.test.ts
git commit -m "feat: add rescue backend module with copy and playlist mutation"
```

---

## Task 2: IPC handlers, preload, and API wiring

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api.ts`

- [ ] **Step 1: Add imports and three handlers to `src/main/ipc.ts`**

Add the import at the top of the file alongside the other main-process imports:

```ts
import { copyFilesFromDevice, addEntriesToPlaylist, createPlaylistFromFilenames } from './rescue'
```

Then add these three handlers inside `registerIpcHandlers`, after the existing `sync:execute` handler:

```ts
  ipcMain.handle('sync:copy-from-device', (_e, pairs: { src: string; dest: string }[]) =>
    copyFilesFromDevice(pairs)
  )

  ipcMain.handle('playlists:add-entries', (_e, stem: string, filenames: string[]) =>
    addEntriesToPlaylist(playlistsDir(), stem, filenames)
  )

  ipcMain.handle('playlists:create-from-filenames', (_e, name: string, platform: string, filenames: string[]) =>
    createPlaylistFromFilenames(playlistsDir(), name, platform, filenames)
  )
```

- [ ] **Step 2: Add three methods to `src/preload/index.ts`**

Add these inside the `contextBridge.exposeInMainWorld('api', { … })` block, after `importPlaylistFromDevice`:

```ts
  copyFromDevice: (pairs: { src: string; dest: string }[]) =>
    ipcRenderer.invoke('sync:copy-from-device', pairs),
  addPlaylistEntries: (stem: string, filenames: string[]) =>
    ipcRenderer.invoke('playlists:add-entries', stem, filenames),
  createPlaylistFromFilenames: (name: string, platform: string, filenames: string[]) =>
    ipcRenderer.invoke('playlists:create-from-filenames', name, platform, filenames),
```

- [ ] **Step 3: Add three method types to `src/renderer/src/api.ts`**

Add these inside the `api:` type declaration in the `Window` interface, after `importPlaylistFromDevice`:

```ts
      copyFromDevice: (pairs: { src: string; dest: string }[]) => Promise<{ copied: number; errors: string[] }>
      addPlaylistEntries: (stem: string, filenames: string[]) => Promise<{ error: string | null }>
      createPlaylistFromFilenames: (name: string, platform: string, filenames: string[]) => Promise<{ stem: string } | { error: string }>
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS (IPC layer has no unit tests; correctness is verified by the rescue module tests in Task 1)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat: wire rescue IPC handlers and expose to renderer"
```

---

## Task 3: Selection UI in SyncPreview

**Files:**
- Modify: `src/renderer/src/components/SyncPreview.tsx`

- [ ] **Step 1: Replace `SyncPreview.tsx` with the updated version**

The key changes versus the current file:
- `groupToDelete` now returns `Map<string, { path: string; filename: string }[]>` instead of `Map<string, string[]>`
- `Props` gains `onRescueComplete: () => void`
- Component gains `selectedPaths` and `rescueOpen` state
- To Delete panel gets checkboxes and a rescue toolbar
- `RescueModal` is rendered when `rescueOpen` is true

Full replacement of `src/renderer/src/components/SyncPreview.tsx`:

```tsx
import React, { useState } from 'react'
import type { SyncPreview as SyncPreviewType, SkippedEntry, SkipReason } from '@shared/types'
import { StorageBar } from './StorageBar'
import { RescueModal } from './RescueModal'

function skipPlatform(s: SkippedEntry): string {
  if (s.reason === 'platform-not-mapped' && s.match.rom) return s.match.rom.platform
  const p = s.match.entry.platform
  return Array.isArray(p) ? (p[0] ?? 'unknown') : p
}

function groupToDelete(
  items: { platform: string; path: string }[]
): Map<string, { path: string; filename: string }[]> {
  const map = new Map<string, { path: string; filename: string }[]>()
  for (const { platform, path } of items) {
    const bucket = map.get(platform) ?? []
    map.set(platform, bucket)
    bucket.push({ path, filename: path.split('/').pop() ?? path })
  }
  return map
}

function groupSkipped(items: SkippedEntry[]): Map<string, SkippedEntry[]> {
  const map = new Map<string, SkippedEntry[]>()
  for (const s of items) {
    const platform = skipPlatform(s)
    const bucket = map.get(platform) ?? []
    map.set(platform, bucket)
    bucket.push(s)
  }
  return map
}

const REASON_LABEL: Record<SkipReason, string> = {
  'no-match': 'no library match',
  'platform-not-mapped': 'platform not on device'
}

interface Props {
  preview: SyncPreviewType
  onRescueComplete: () => void
}

export function SyncPreviewPanel({ preview, onRescueComplete }: Props): React.JSX.Element {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [rescueOpen, setRescueOpen] = useState(false)

  const deleteGroups = groupToDelete(preview.toDelete)
  const skipGroups = groupSkipped(preview.skipped)

  function togglePath(path: string): void {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleGroup(paths: string[]): void {
    const allSelected = paths.every(p => selectedPaths.has(p))
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (allSelected) paths.forEach(p => next.delete(p))
      else paths.forEach(p => next.add(p))
      return next
    })
  }

  const selectedItems = preview.toDelete.filter(item => selectedPaths.has(item.path))

  return (
    <div>
      <StorageBar
        available={preview.availableBytes}
        total={preview.availableBytes + preview.totalCopyBytes}
        projectedAdd={preview.totalCopyBytes}
      />

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>

        {/* To Copy — flat, unchanged */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#4caf50', fontWeight: 700, marginBottom: 8 }}>
            To Copy ({preview.toCopy.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {preview.toCopy.map((r, i) => (
              <div key={i} style={{ padding: '2px 0', color: '#aaa' }}>{r.rom.filename}</div>
            ))}
          </div>
        </div>

        {/* To Delete — grouped by platform with selection */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#f44336', fontWeight: 700, marginBottom: 8 }}>
            To Delete ({preview.toDelete.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from(deleteGroups.entries()).map(([platform, items]) => {
              const paths = items.map(i => i.path)
              const allSelected = paths.length > 0 && paths.every(p => selectedPaths.has(p))
              return (
                <div key={platform} style={{ marginTop: 8 }}>
                  <div style={{ color: '#ccc', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(paths)} />
                    {platform} ({items.length})
                  </div>
                  {items.map(({ path, filename }) => (
                    <div key={path} style={{ padding: '2px 0 2px 12px', color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={selectedPaths.has(path)} onChange={() => togglePath(path)} />
                      {filename}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {selectedPaths.size > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #333' }}>
              <button
                onClick={() => setRescueOpen(true)}
                style={{ padding: '6px 14px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                Rescue {selectedPaths.size} {selectedPaths.size === 1 ? 'item' : 'items'} →
              </button>
            </div>
          )}
        </div>

        {/* Skipped — grouped by platform with reason label */}
        <div style={{ flex: 1, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
          <div style={{ color: '#ff9800', fontWeight: 700, marginBottom: 8 }}>
            Skipped ({preview.skipped.length})
          </div>
          <div style={{ fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from(skipGroups.entries()).map(([platform, entries]) => (
              <div key={platform} style={{ marginTop: 8 }}>
                <div style={{ color: '#ccc', fontWeight: 700, fontSize: 11 }}>
                  {platform} ({entries.length})
                </div>
                {entries.map((s, i) => (
                  <div key={i} style={{ padding: '2px 0 2px 12px', color: '#aaa' }}>
                    {s.match.entry.raw}
                    <span style={{ color: '#555', fontSize: 11, marginLeft: 6 }}>
                      · {REASON_LABEL[s.reason]}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>

      {rescueOpen && (
        <RescueModal
          items={selectedItems}
          onClose={() => setRescueOpen(false)}
          onComplete={() => {
            setRescueOpen(false)
            setSelectedPaths(new Set())
            onRescueComplete()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS (no test imports SyncPreview directly)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SyncPreview.tsx
git commit -m "feat: add multi-select and rescue toolbar to To Delete panel"
```

---

## Task 4: RescueModal component

**Files:**
- Create: `src/renderer/src/components/RescueModal.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/RescueModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import type { AppConfig, Playlist } from '@shared/types'
import { api } from '../api'

interface Props {
  items: { platform: string; path: string }[]
  onClose: () => void
  onComplete: () => void
}

function filenameOf(path: string): string {
  return path.split('/').pop() ?? path
}

function groupByPlatform(
  items: { platform: string; path: string }[]
): Map<string, { platform: string; path: string }[]> {
  const map = new Map<string, { platform: string; path: string }[]>()
  for (const item of items) {
    const bucket = map.get(item.platform) ?? []
    map.set(item.platform, bucket)
    bucket.push(item)
  }
  return map
}

export function RescueModal({ items, onClose, onComplete }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<AppConfig | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [copyEnabled, setCopyEnabled] = useState(true)
  const [playlistEnabled, setPlaylistEnabled] = useState(true)
  const [destOverrides, setDestOverrides] = useState<Record<string, string>>({})
  const [playlistChoice, setPlaylistChoice] = useState<string>('new')
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s)
      const overrides: Record<string, string> = {}
      for (const item of items) {
        if (!overrides[item.platform]) {
          overrides[item.platform] = `${s.libraryPath}/${item.platform}`
        }
      }
      setDestOverrides(overrides)
    })
    api.listPlaylists().then(results => {
      setPlaylists(results.filter(r => r.playlist !== null).map(r => r.playlist!))
    })
  }, [])

  const platforms = [...new Set(items.map(i => i.platform))]
  const inferredPlatform = platforms.length === 1 ? platforms[0] : ''
  const groups = groupByPlatform(items)

  async function handleFolderPick(platform: string): Promise<void> {
    const picked = await api.openFolderPicker()
    if (picked) setDestOverrides(prev => ({ ...prev, [platform]: picked }))
  }

  async function handleConfirm(): Promise<void> {
    setWorking(true)
    setError(null)

    if (copyEnabled && settings) {
      const pairs = items.map(item => ({
        src: item.path,
        dest: `${destOverrides[item.platform] ?? `${settings.libraryPath}/${item.platform}`}/${filenameOf(item.path)}`
      }))
      const result = await api.copyFromDevice(pairs)
      if (result.errors.length > 0) {
        setError(`Copy errors:\n${result.errors.join('\n')}`)
        setWorking(false)
        return
      }
    }

    if (playlistEnabled) {
      const filenames = items.map(i => filenameOf(i.path))
      if (playlistChoice === 'new') {
        const r = await api.createPlaylistFromFilenames(newPlaylistName, inferredPlatform, filenames)
        if ('error' in r) { setError(r.error); setWorking(false); return }
      } else {
        const r = await api.addPlaylistEntries(playlistChoice, filenames)
        if (r.error) { setError(r.error); setWorking(false); return }
      }
    }

    setWorking(false)
    onComplete()
  }

  const canConfirm = !working &&
    (copyEnabled || playlistEnabled) &&
    !(playlistEnabled && playlistChoice === 'new' && newPlaylistName.trim().length === 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#2a2a2a', borderRadius: 8, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px' }}>
          Rescue {items.length} {items.length === 1 ? 'item' : 'items'}
        </h3>

        {/* Copy to Library */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={copyEnabled} onChange={e => setCopyEnabled(e.target.checked)} />
            Copy to Library
          </label>
          {copyEnabled && settings && (
            <div style={{ paddingLeft: 24 }}>
              {Array.from(groups.entries()).map(([platform, groupItems]) => (
                <div key={platform} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                    {platform} — {groupItems.length} {groupItems.length === 1 ? 'file' : 'files'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {destOverrides[platform] ?? `${settings.libraryPath}/${platform}`}
                    </span>
                    <button
                      onClick={() => handleFolderPick(platform)}
                      style={{ padding: '2px 8px', background: '#3a3a3a', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add to Playlist */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={playlistEnabled} onChange={e => setPlaylistEnabled(e.target.checked)} />
            Add to Playlist
          </label>
          {playlistEnabled && (
            <div style={{ paddingLeft: 24 }}>
              <select
                value={playlistChoice}
                onChange={e => setPlaylistChoice(e.target.value)}
                style={{ padding: '6px 8px', background: '#1e1e1e', color: '#fff', border: '1px solid #444', borderRadius: 4, width: '100%', marginBottom: 8 }}
              >
                {playlists.map(p => (
                  <option key={p.stem} value={p.stem}>{p.name}</option>
                ))}
                <option value="new">New playlist…</option>
              </select>
              {playlistChoice === 'new' && (
                <input
                  type="text"
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  style={{ padding: '6px 8px', background: '#1e1e1e', color: '#fff', border: '1px solid #444', borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
                />
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: 10, background: '#f4433622', border: '1px solid #f44336', borderRadius: 4, marginBottom: 16, color: '#f44336', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={working}
            style={{ padding: '8px 16px', background: '#3a3a3a', color: '#ccc', border: 'none', borderRadius: 4, cursor: working ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ padding: '8px 16px', background: canConfirm ? '#4caf50' : '#555', color: '#fff', border: 'none', borderRadius: 4, cursor: canConfirm ? 'pointer' : 'default', fontWeight: 700 }}
          >
            {working ? 'Working…' : 'Rescue'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/RescueModal.tsx
git commit -m "feat: add RescueModal confirmation overlay"
```

---

## Task 5: Wire SyncView

**Files:**
- Modify: `src/renderer/src/views/SyncView.tsx`

- [ ] **Step 1: Pass `onRescueComplete` to `SyncPreviewPanel`**

In `src/renderer/src/views/SyncView.tsx`, find the line:

```tsx
<SyncPreviewPanel preview={preview} />
```

Replace it with:

```tsx
<SyncPreviewPanel preview={preview} onRescueComplete={handlePreview} />
```

`handlePreview` is already defined in `SyncView` — it re-runs the preview for the selected device. No other changes needed.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 3: Build to catch TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/SyncView.tsx
git commit -m "feat: re-run preview after rescue via onRescueComplete callback"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the happy path**

1. Select a device that has ROMs not covered by any playlist (so "To Delete" is non-empty)
2. Click "Preview Sync" — confirm the To Delete panel shows filenames with checkboxes
3. Check one or more individual items; verify "Rescue N items →" button appears
4. Click a platform group header checkbox — verify all items in that group are selected/deselected
5. Click "Rescue N items →" — confirm the modal opens
6. Verify the copy destination defaults to `{libraryPath}/{platform}/` and the "Change" button opens a folder picker
7. Verify the playlist dropdown shows existing playlists plus "New playlist…"
8. Select "New playlist…" and enter a name — verify the Rescue button is enabled
9. Click Rescue — verify: modal closes, selection clears, preview re-runs automatically
10. Check that the rescued file is no longer in the To Delete list

- [ ] **Step 3: Verify error handling**

1. Toggle off both "Copy to Library" and "Add to Playlist" — verify Rescue button is disabled
2. Select "New playlist…" but leave the name empty — verify Rescue button is disabled
