# Playlist-Device Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store playlist assignments in `rom-sync.yaml` on the SD card and expose them as checkboxes on the device detail page, replacing the hardcoded empty-stems stub in the sync flow.

**Architecture:** `DeviceConfig` gains a `playlists: string[]` field. `readDeviceConfig`/`writeDeviceConfig` handle it transparently (missing key → `[]`; empty list → key omitted from YAML). The `sync:preview` and `sync:execute` IPC handlers drop their `playlistStems` param and read from `config.playlists` instead. The device detail view in `DevicesView` shows all available playlists as checkboxes that auto-save on toggle.

**Tech Stack:** TypeScript, Electron 29 (contextBridge IPC), React 18 hooks, js-yaml, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `playlists: string[]` to `DeviceConfig` |
| `src/main/device-detector.ts` | Parse and serialize `playlists` in `readDeviceConfig` / `writeDeviceConfig` |
| `tests/device-detector.test.ts` | Add 5 tests for playlists; update existing configs to include `playlists: []` |
| `src/main/ipc.ts` | Remove `playlistStems` param from `sync:preview` and `sync:execute` handlers |
| `src/preload/index.ts` | Remove `stems` param from `previewSync` and `executeSync` |
| `src/renderer/src/api.ts` | Update type declarations for `previewSync` and `executeSync` |
| `src/renderer/src/views/SyncView.tsx` | Remove `playlistStems` state; update calls to `previewSync` and `executeSync` |
| `src/renderer/src/views/DevicesView.tsx` | Add Playlists section to device detail view |

---

### Task 1: Update `DeviceConfig` type and backend

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/device-detector.ts`
- Modify: `tests/device-detector.test.ts`

- [ ] **Step 1: Write failing tests**

Open `tests/device-detector.test.ts`. The existing `writeDeviceConfig` round-trip test passes a config without `playlists` — it will fail to compile once the type is updated. Add the new tests AND update the existing ones.

Replace the entire file with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readDeviceConfig, writeDeviceConfig, listSubdirs } from '../src/main/device-detector'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dev-test-')) })
afterEach(() => rmSync(dir, { recursive: true }))

describe('readDeviceConfig', () => {
  it('parses a valid rom-sync.yaml', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: MiSTer FPGA
platforms:
  gba: /games/gba
  snes: /games/snes
`)
    const result = readDeviceConfig(dir)
    expect(result.config).not.toBeNull()
    expect(result.config!.deviceName).toBe('MiSTer FPGA')
    expect(result.config!.platforms['gba']).toBe('/games/gba')
    expect(result.config!.playlists).toEqual([])
    expect(result.error).toBeNull()
  })

  it('parses playlists field when present', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
playlists:
  - gba-favorites
  - snes-classics
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual(['gba-favorites', 'snes-classics'])
  })

  it('defaults playlists to [] when key is absent', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual([])
  })

  it('defaults playlists to [] when value is not an array', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `
device_name: My Card
platforms:
  gba: /Roms/GBA
playlists: not-an-array
`)
    const result = readDeviceConfig(dir)
    expect(result.config!.playlists).toEqual([])
  })

  it('returns error when rom-sync.yaml is missing', () => {
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).toMatch(/not found/i)
  })

  it('returns error when device_name is missing', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `platforms:\n  gba: /games/gba`)
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).toMatch(/device_name/i)
  })

  it('returns error for YAML parse failure', () => {
    writeFileSync(join(dir, 'rom-sync.yaml'), `device_name: [broken`)
    const result = readDeviceConfig(dir)
    expect(result.config).toBeNull()
    expect(result.error).not.toBeNull()
  })
})

describe('writeDeviceConfig', () => {
  it('writes a valid rom-sync.yaml that readDeviceConfig can read back', () => {
    const config = {
      deviceName: 'My Card',
      platforms: { gba: '/Roms/GBA', snes: '/Roms/SNES' },
      playlists: []
    }
    const result = writeDeviceConfig(dir, config)
    expect(result.error).toBeNull()

    const readBack = readDeviceConfig(dir)
    expect(readBack.error).toBeNull()
    expect(readBack.config).toEqual(config)
  })

  it('round-trips playlists correctly', () => {
    const config = {
      deviceName: 'My Card',
      platforms: { gba: '/Roms/GBA' },
      playlists: ['gba-favorites', 'all-gba']
    }
    writeDeviceConfig(dir, config)
    const readBack = readDeviceConfig(dir)
    expect(readBack.config!.playlists).toEqual(['gba-favorites', 'all-gba'])
  })

  it('omits playlists key when list is empty', () => {
    writeDeviceConfig(dir, { deviceName: 'My Card', platforms: { gba: '/Roms/GBA' }, playlists: [] })
    const raw = readFileSync(join(dir, 'rom-sync.yaml'), 'utf-8')
    expect(raw).not.toContain('playlists')
  })

  it('returns an error when the mount point does not exist', () => {
    const result = writeDeviceConfig('/nonexistent/path/xyz', {
      deviceName: 'Test',
      platforms: { gba: '/Roms/GBA' },
      playlists: []
    })
    expect(result.error).not.toBeNull()
  })

  it('returns an error when deviceName is empty', () => {
    const result = writeDeviceConfig(dir, { deviceName: '', platforms: { gba: '/Roms/GBA' }, playlists: [] })
    expect(result.error).not.toBeNull()
  })
})

describe('listSubdirs', () => {
  it('returns names of immediate subdirectories', () => {
    mkdirSync(join(dir, 'GBA'))
    mkdirSync(join(dir, 'SNES'))
    writeFileSync(join(dir, 'not-a-dir.txt'), '')
    const result = listSubdirs(dir)
    expect(result).toHaveLength(2)
    expect(result).toContain('GBA')
    expect(result).toContain('SNES')
    expect(result).not.toContain('not-a-dir.txt')
  })

  it('returns empty array for nonexistent path', () => {
    expect(listSubdirs('/nonexistent/path/xyz')).toEqual([])
  })

  it('returns empty array for empty directory', () => {
    expect(listSubdirs(dir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/device-detector.test.ts
```

Expected: TypeScript errors or test failures mentioning `playlists`.

- [ ] **Step 3: Update `DeviceConfig` type**

Open `src/shared/types.ts`. Find the `DeviceConfig` interface and add `playlists`:

```typescript
export interface DeviceConfig {
  deviceName: string
  platforms: Record<string, string>  // platform -> path on card
  playlists: string[]                // playlist stems assigned to this device
}
```

- [ ] **Step 4: Update `readDeviceConfig` to parse `playlists`**

Open `src/main/device-detector.ts`. Find the `return { config: { ... }, error: null }` block inside `readDeviceConfig` (currently around line 40) and update it:

```typescript
  return {
    config: {
      deviceName: doc['device_name'],
      platforms: doc['platforms'] as Record<string, string>,
      playlists: Array.isArray(doc['playlists'])
        ? (doc['playlists'] as unknown[]).filter((s): s is string => typeof s === 'string')
        : []
    },
    error: null
  }
```

- [ ] **Step 5: Update `writeDeviceConfig` to serialize `playlists`**

In the same file, find the `writeDeviceConfig` function. Replace the `yaml.dump(...)` call:

```typescript
  try {
    const yamlDoc: Record<string, unknown> = {
      device_name: config.deviceName,
      platforms: config.platforms
    }
    if (config.playlists.length > 0) {
      yamlDoc.playlists = config.playlists
    }
    const content = yaml.dump(yamlDoc)
    writeFileSync(configPath, content, 'utf-8')
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/device-detector.test.ts
```

Expected: all tests PASS (should be 15 tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/device-detector.ts tests/device-detector.test.ts
git commit -m "feat: add playlists field to DeviceConfig with parse/serialize support"
```

---

### Task 2: Update IPC sync handlers

**Files:**
- Modify: `src/main/ipc.ts`

The `sync:preview` and `sync:execute` handlers currently accept `playlistStems: string[]` as a parameter and iterate over it. They need to read `config.playlists` from the device config instead.

- [ ] **Step 1: Update `sync:preview` handler**

Open `src/main/ipc.ts`. Find the `ipcMain.handle('sync:preview', ...)` block (around line 68) and replace it entirely:

```typescript
  ipcMain.handle('sync:preview', (_e, mountPoint: string) => {
    const { config: deviceConfig, error } = readDeviceConfig(mountPoint)
    if (!deviceConfig) return { error: error ?? 'Could not read device config' }

    const byKey = buildPlaylistMap(playlistsDir())
    const allEntries: import('@shared/types').PlaylistEntry[] = []
    for (const stem of deviceConfig.playlists) {
      const result = resolvePlaylist(stem, byKey)
      if (result.error) return { error: result.error }
      allEntries.push(...result.entries)
    }
    const { fuzzyMatchThreshold } = getConfig()
    const matches: MatchResult[] = matchEntries(db, allEntries, fuzzyMatchThreshold)

    const preview = computeSyncPreview(matches, deviceConfig, mountPoint)

    const volumes = listMountedVolumes()
    const vol = volumes.find((v) => v.mountPoint === mountPoint)
    if (vol) preview.availableBytes = vol.availableBytes

    return preview
  })
```

- [ ] **Step 2: Update `sync:execute` handler**

Find the `ipcMain.handle('sync:execute', ...)` block (around line 91) and replace it entirely:

```typescript
  ipcMain.handle('sync:execute', async (_e, mountPoint: string) => {
    const { config: deviceConfig, error } = readDeviceConfig(mountPoint)
    if (!deviceConfig) return { error: error ?? 'Could not read device config' }

    const byKey = buildPlaylistMap(playlistsDir())
    const allEntries: import('@shared/types').PlaylistEntry[] = []
    for (const stem of deviceConfig.playlists) {
      const result = resolvePlaylist(stem, byKey)
      if (result.error) return { error: result.error }
      allEntries.push(...result.entries)
    }
    const { fuzzyMatchThreshold } = getConfig()
    const matches: MatchResult[] = matchEntries(db, allEntries, fuzzyMatchThreshold)

    const { config: freshConfig } = readDeviceConfig(mountPoint)
    const preview = computeSyncPreview(matches, freshConfig ?? deviceConfig, mountPoint)

    return executeSyncPlan(preview, logsDir(), (progress) => {
      mainWindow.webContents.send('sync:progress', progress)
    })
  })
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: sync handlers read playlists from device config, drop stems param"
```

---

### Task 3: Update preload and api type declarations

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api.ts`

- [ ] **Step 1: Update preload**

Open `src/preload/index.ts`. Find these two lines in the Sync section:

```typescript
  previewSync: (mountPoint: string, stems: string[]) => ipcRenderer.invoke('sync:preview', mountPoint, stems),
  executeSync: (mountPoint: string, stems: string[]) => ipcRenderer.invoke('sync:execute', mountPoint, stems),
```

Replace with:

```typescript
  previewSync: (mountPoint: string) => ipcRenderer.invoke('sync:preview', mountPoint),
  executeSync: (mountPoint: string) => ipcRenderer.invoke('sync:execute', mountPoint),
```

- [ ] **Step 2: Update api.ts type declarations**

Open `src/renderer/src/api.ts`. Find these two lines inside the `Window['api']` interface:

```typescript
      previewSync: (mountPoint: string, stems: string[]) => Promise<SyncPreview>
      executeSync: (mountPoint: string, stems: string[]) => Promise<SyncResult>
```

Replace with:

```typescript
      previewSync: (mountPoint: string) => Promise<SyncPreview>
      executeSync: (mountPoint: string) => Promise<SyncResult>
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat: remove playlistStems param from previewSync and executeSync"
```

---

### Task 4: Update SyncView

**Files:**
- Modify: `src/renderer/src/views/SyncView.tsx`

- [ ] **Step 1: Remove `playlistStems` state and update calls**

Open `src/renderer/src/views/SyncView.tsx`. Make three changes:

**Remove the `playlistStems` state** (the comment and the useState line, around lines 15-17):

```typescript
  // In a future task, playlist stems would come from device assignment config.
  // For now, empty array produces a valid preview (shows all card files as to-delete).
  const [playlistStems] = useState<string[]>([])
```

Delete those 3 lines entirely.

**Update `handlePreview`** — remove `playlistStems` from the call:

```typescript
  async function handlePreview(): Promise<void> {
    if (!selectedVolume) return
    setPreviewLoading(true)
    setPreview(null)
    setPreviewError(null)
    const p = await api.previewSync(selectedVolume) as SyncPreview | { error: string }
    if ('error' in p) {
      setPreviewError(p.error)
    } else {
      setPreview(p)
    }
    setPreviewLoading(false)
  }
```

**Update `handleSync`** — remove `playlistStems` from the call:

```typescript
  async function handleSync(): Promise<void> {
    if (!selectedVolume || !preview) return
    setSyncing(true)
    setResult(null)
    setProgress(null)
    const r = await api.executeSync(selectedVolume)
    setResult(r)
    setSyncing(false)
  }
```

- [ ] **Step 2: Verify the app builds without errors**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: no output (zero TypeScript errors). If `typecheck` isn't a script, use:

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/SyncView.tsx
git commit -m "feat: SyncView uses device-config playlists, remove playlistStems stub"
```

---

### Task 5: Add Playlists section to DevicesView

**Files:**
- Modify: `src/renderer/src/views/DevicesView.tsx`

This task adds three things to `DevicesView`:
1. Two new state variables: `availablePlaylists` and `playlistSaveError`
2. Load playlists in `handleSelect`
3. Render the Playlists section in the existing-config branch

- [ ] **Step 1: Add new state variables**

Open `src/renderer/src/views/DevicesView.tsx`. Find the existing state declarations block (lines 30–35):

```typescript
  const nextRowId = React.useRef(1)
  const [deviceName, setDeviceName] = useState('')
  const [romsRoot, setRomsRoot] = useState<string | null>(null)
  const [platformRows, setPlatformRows] = useState<PlatformRow[]>([{ id: 0, platform: '', path: null }])
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
```

Add two new state variables after `setCreating`:

```typescript
  const nextRowId = React.useRef(1)
  const [deviceName, setDeviceName] = useState('')
  const [romsRoot, setRomsRoot] = useState<string | null>(null)
  const [platformRows, setPlatformRows] = useState<PlatformRow[]>([{ id: 0, platform: '', path: null }])
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [availablePlaylists, setAvailablePlaylists] = useState<Array<{ stem: string; name: string }>>([])
  const [playlistSaveError, setPlaylistSaveError] = useState<string | null>(null)
```

- [ ] **Step 2: Load playlists in `handleSelect`**

Find the `handleSelect` function:

```typescript
  async function handleSelect(vol: MountedVolume): Promise<void> {
    setLoading(true)
    const { config, error } = await api.readDeviceConfig(vol.mountPoint)
    setSelected({ volume: vol, config, configError: error })
    setDeviceName(vol.name)
    setRomsRoot(null)
    setPlatformRows([{ id: nextRowId.current++, platform: '', path: null }])
    setCreateError(null)
    setLoading(false)
  }
```

Replace with:

```typescript
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
```

- [ ] **Step 3: Add `handleTogglePlaylist` function**

After the `handleCreate` function and before the `canCreate` declaration, add:

```typescript
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
```

- [ ] **Step 4: Render the Playlists section**

Find the `{selected.config && (` branch (around line 249). Inside it, after the closing `</table>` of the platform mappings table and before the closing `</div>`, add the Playlists section:

The current end of the `selected.config` branch looks like:

```tsx
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
```

Replace with:

```tsx
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
```

- [ ] **Step 5: Verify the app builds without TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no output.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/DevicesView.tsx
git commit -m "feat: add playlist assignment checkboxes to device detail view"
```
