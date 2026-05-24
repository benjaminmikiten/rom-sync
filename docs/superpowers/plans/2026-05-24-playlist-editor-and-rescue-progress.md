# Playlist Editor Open-in-Editor + Rescue Copy Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Open in Editor" button to the PlaylistEditor view, and add an inline copy-progress indicator (file count, current file, ETA) to the RescueModal.

**Architecture:** Feature 1 adds a single IPC handler (`playlists:open-file` → `shell.openPath`) and threads `filePath` through the existing `Playlist` type into `PlaylistEditor`. Feature 2 adds an optional `onProgress` callback to `copyFilesFromDevice`, wires it to an IPC push channel (`rescue:copy-progress`), and renders an inline progress section in `RescueModal` — mirroring the existing `sync:progress` pattern used by the sync executor.

**Tech Stack:** Electron IPC, React 18, vitest, Node `fs`

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Modify | `src/main/ipc.ts` | Add `playlists:open-file` handler; update `sync:copy-from-device` to pass progress callback |
| Modify | `src/preload/index.ts` | Expose `openPlaylistFile`, `onRescueCopyProgress` |
| Modify | `src/renderer/src/api.ts` | Add types for both new methods |
| Modify | `src/renderer/src/components/PlaylistEditor.tsx` | Add `filePath` prop + "Open in Editor" button |
| Modify | `src/renderer/src/views/PlaylistsView.tsx` | Pass `filePath={selected.filePath}` to `PlaylistEditor` |
| Modify | `src/shared/types.ts` | Add `RescueCopyProgress` interface |
| Modify | `src/main/rescue.ts` | Add optional `onProgress` param to `copyFilesFromDevice` |
| Modify | `src/renderer/src/components/RescueModal.tsx` | Subscribe to progress; render inline progress section |
| Test   | `tests/rescue.test.ts` | Add 3 tests for `onProgress` callback behavior |

---

## Task 1: Open-in-Editor — IPC, preload, and API

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api.ts`

No unit tests for IPC handlers in this project — correctness is verified by the build in Task 2.

- [ ] **Step 1: Add `playlists:open-file` handler to `src/main/ipc.ts`**

Find the `playlists:open-folder` handler (around line 156):
```ts
ipcMain.handle('playlists:open-folder', () => {
  const dir = playlistsDir()
  mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
})
```

Add this immediately after it:
```ts
ipcMain.handle('playlists:open-file', (_e, filePath: string) => shell.openPath(filePath))
```

`shell` is already imported at the top of `ipc.ts` — no new imports needed.

- [ ] **Step 2: Expose `openPlaylistFile` in `src/preload/index.ts`**

Find the `importPlaylistFromDevice` line and add `openPlaylistFile` immediately after it:
```ts
  openPlaylistFile: (filePath: string) => ipcRenderer.invoke('playlists:open-file', filePath),
```

- [ ] **Step 3: Add type to `src/renderer/src/api.ts`**

The file starts with:
```ts
import type {
  AppConfig, Rom, ScanProgress, Playlist, ValidationIssue,
  MatchResult, MountedVolume, DeviceConfig, SyncPreview, SyncProgress, SyncResult
} from '@shared/types'
```

In the `Window` interface `api:` block, find `importPlaylistFromDevice` and add immediately after it:
```ts
      openPlaylistFile: (filePath: string) => Promise<void>
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: 92 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat: add playlists:open-file IPC handler and expose to renderer"
```

---

## Task 2: Open-in-Editor — PlaylistEditor and PlaylistsView UI

**Files:**
- Modify: `src/renderer/src/components/PlaylistEditor.tsx`
- Modify: `src/renderer/src/views/PlaylistsView.tsx`

- [ ] **Step 1: Add `filePath` prop and "Open in Editor" button to `PlaylistEditor.tsx`**

The current `Props` interface:
```ts
interface Props {
  stem: string
  name: string
  onClose: () => void
}
```

Replace with:
```ts
interface Props {
  stem: string
  name: string
  filePath: string
  onClose: () => void
}
```

The current component signature:
```ts
export function PlaylistEditor({ stem, name, onClose }: Props): React.JSX.Element {
```

Replace with:
```ts
export function PlaylistEditor({ stem, name, filePath, onClose }: Props): React.JSX.Element {
```

The current header `<div>` (lines 22–26):
```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={onClose} style={{ background: 'none', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
        <h2 style={{ margin: 0 }}>{name}</h2>
      </div>
```

Replace with:
```tsx
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
```

- [ ] **Step 2: Pass `filePath` from `PlaylistsView.tsx`**

Find this line in `PlaylistsView.tsx` (around line 41):
```tsx
    return <PlaylistEditor stem={selected.stem} name={selected.name} onClose={() => setSelected(null)} />
```

Replace with:
```tsx
    return <PlaylistEditor stem={selected.stem} name={selected.name} filePath={selected.filePath} onClose={() => setSelected(null)} />
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: 92 tests, all pass.

- [ ] **Step 4: Build to catch TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/PlaylistEditor.tsx src/renderer/src/views/PlaylistsView.tsx
git commit -m "feat: add Open in Editor button to PlaylistEditor"
```

---

## Task 3: `RescueCopyProgress` type + `copyFilesFromDevice` onProgress (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/rescue.ts`
- Test: `tests/rescue.test.ts`

- [ ] **Step 1: Add `RescueCopyProgress` to `src/shared/types.ts`**

At the bottom of the file, after `SyncResult`, add:

```ts
export interface RescueCopyProgress {
  copied: number
  total: number
  currentFile: string
}
```

- [ ] **Step 2: Write the failing tests**

Add these three tests inside the existing `describe('copyFilesFromDevice', () => { … })` block in `tests/rescue.test.ts`, after the last existing test in that block:

```ts
  it('calls onProgress after each successful copy', () => {
    writeFileSync(join(srcDir, 'A.gba'), 'a')
    writeFileSync(join(srcDir, 'B.gba'), 'b')
    const progress: { copied: number; total: number; currentFile: string }[] = []
    copyFilesFromDevice([
      { src: join(srcDir, 'A.gba'), dest: join(destDir, 'A.gba') },
      { src: join(srcDir, 'B.gba'), dest: join(destDir, 'B.gba') }
    ], (p) => progress.push(p))
    expect(progress).toHaveLength(2)
    expect(progress[0]).toEqual({ copied: 1, total: 2, currentFile: 'A.gba' })
    expect(progress[1]).toEqual({ copied: 2, total: 2, currentFile: 'B.gba' })
  })

  it('calls onProgress with current filename on error', () => {
    writeFileSync(join(srcDir, 'Good.gba'), 'content')
    const progress: { copied: number; total: number; currentFile: string }[] = []
    copyFilesFromDevice([
      { src: join(srcDir, 'Missing.gba'), dest: join(destDir, 'Missing.gba') },
      { src: join(srcDir, 'Good.gba'), dest: join(destDir, 'Good.gba') }
    ], (p) => progress.push(p))
    expect(progress).toHaveLength(2)
    expect(progress[0]).toMatchObject({ copied: 0, total: 2, currentFile: 'Missing.gba' })
    expect(progress[1]).toMatchObject({ copied: 1, total: 2, currentFile: 'Good.gba' })
  })

  it('does not throw when onProgress is not provided', () => {
    writeFileSync(join(srcDir, 'Game.gba'), 'content')
    expect(() => copyFilesFromDevice([
      { src: join(srcDir, 'Game.gba'), dest: join(destDir, 'Game.gba') }
    ])).not.toThrow()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/rescue.test.ts
```

Expected: the two `onProgress` tests FAIL (extra argument is ignored, so `progress` array stays empty). The "does not throw" test passes already.

- [ ] **Step 4: Update `copyFilesFromDevice` in `src/main/rescue.ts`**

Replace the current function (lines 6–21) with:

```ts
export function copyFilesFromDevice(
  pairs: { src: string; dest: string }[],
  onProgress?: (progress: { copied: number; total: number; currentFile: string }) => void
): { copied: number; errors: string[] } {
  const errors: string[] = []
  let copied = 0
  const total = pairs.length
  for (const { src, dest } of pairs) {
    const currentFile = src.split('/').pop() ?? src
    try {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied++
      onProgress?.({ copied, total, currentFile })
    } catch (e: unknown) {
      errors.push(`Failed to copy ${src}: ${e instanceof Error ? e.message : String(e)}`)
      onProgress?.({ copied, total, currentFile })
    }
  }
  return { copied, errors }
}
```

- [ ] **Step 5: Run rescue tests to verify they pass**

```bash
npx vitest run tests/rescue.test.ts
```

Expected: 18 tests, all pass (15 existing + 3 new).

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: 95 tests, all pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/rescue.ts tests/rescue.test.ts
git commit -m "feat: add RescueCopyProgress type and onProgress callback to copyFilesFromDevice"
```

---

## Task 4: Rescue progress — IPC, preload, and API wiring

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api.ts`

- [ ] **Step 1: Update `sync:copy-from-device` handler in `src/main/ipc.ts`**

Find the current handler (around line 116):
```ts
  ipcMain.handle('sync:copy-from-device', (_e, pairs: { src: string; dest: string }[]) =>
    copyFilesFromDevice(pairs)
  )
```

Replace with:
```ts
  ipcMain.handle('sync:copy-from-device', (_e, pairs: { src: string; dest: string }[]) =>
    copyFilesFromDevice(pairs, (progress) => {
      mainWindow.webContents.send('rescue:copy-progress', progress)
    })
  )
```

- [ ] **Step 2: Expose `onRescueCopyProgress` in `src/preload/index.ts`**

Find the `onSyncProgress` listener block (the last block before the closing `})` of `exposeInMainWorld`) and add `onRescueCopyProgress` immediately after it:
```ts
  onRescueCopyProgress: (cb: (p: unknown) => void) => {
    ipcRenderer.on('rescue:copy-progress', (_e, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('rescue:copy-progress')
  },
```

- [ ] **Step 3: Add type to `src/renderer/src/api.ts`**

Update the import at the top to include `RescueCopyProgress`:
```ts
import type {
  AppConfig, Rom, ScanProgress, Playlist, ValidationIssue,
  MatchResult, MountedVolume, DeviceConfig, SyncPreview, SyncProgress, SyncResult,
  RescueCopyProgress
} from '@shared/types'
```

In the `api:` block of the `Window` interface, find `onSyncProgress` and add immediately after it:
```ts
      onRescueCopyProgress: (cb: (p: RescueCopyProgress) => void) => () => void
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: 95 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat: wire rescue copy progress IPC push channel"
```

---

## Task 5: RescueModal inline progress UI

**Files:**
- Modify: `src/renderer/src/components/RescueModal.tsx`

- [ ] **Step 1: Update imports in `RescueModal.tsx`**

The current import:
```ts
import type { AppConfig, Playlist } from '@shared/types'
```

Replace with:
```ts
import type { AppConfig, Playlist, RescueCopyProgress } from '@shared/types'
```

- [ ] **Step 2: Add `formatEta` helper above the component**

Add this function before `export function RescueModal`:
```ts
function formatEta(startTime: number, copied: number, total: number): string {
  const elapsed = Date.now() - startTime
  const remaining = Math.round(((total - copied) * elapsed) / copied / 1000)
  if (remaining < 60) return `~${remaining}s remaining`
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  return `~${mins}m ${secs}s remaining`
}
```

- [ ] **Step 3: Add progress state variables**

Find the existing state declarations block (the `useState` calls at the top of the component). After the `const [error, setError] = useState<string | null>(null)` line, add:
```ts
  const [copyProgress, setCopyProgress] = useState<RescueCopyProgress | null>(null)
  const [copyStartTime, setCopyStartTime] = useState<number | null>(null)
```

- [ ] **Step 4: Add subscription useEffect**

After the existing `useEffect` that fetches settings and playlists, add:
```ts
  useEffect(() => {
    const unsub = api.onRescueCopyProgress(p => setCopyProgress(p))
    return unsub
  }, [])
```

- [ ] **Step 5: Reset progress state at the start of `handleConfirm`**

Find `handleConfirm` and add these two lines immediately after `setWorking(true)` and `setError(null)`:
```ts
    setCopyProgress(null)
    setCopyStartTime(Date.now())
```

- [ ] **Step 6: Add the inline progress section to the JSX**

Find the error display `div` in the JSX:
```tsx
        {error && (
          <div style={{ padding: 10, background: '#f4433622', ...
```

Add the progress section immediately before it:
```tsx
        {working && copyEnabled && copyProgress && (
          <div style={{ marginBottom: 16, padding: 12, background: '#1a1a1a', borderRadius: 6 }}>
            <div style={{ height: 4, background: '#333', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', background: '#4a9eff', borderRadius: 2, transition: 'width 0.2s',
                width: `${Math.round((copyProgress.copied / copyProgress.total) * 100)}%`
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: copyProgress.copied === copyProgress.total ? '#4caf50' : '#ccc' }}>
                {copyProgress.copied === copyProgress.total
                  ? 'Copy complete ✓'
                  : `${copyProgress.copied} / ${copyProgress.total} files`}
              </span>
              {copyStartTime !== null && copyProgress.copied > 0 && copyProgress.copied < copyProgress.total && (
                <span style={{ color: '#888' }}>
                  {formatEta(copyStartTime, copyProgress.copied, copyProgress.total)}
                </span>
              )}
            </div>
            {copyProgress.copied < copyProgress.total && (
              <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {copyProgress.currentFile}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: 95 tests, all pass.

- [ ] **Step 8: Build to catch TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/RescueModal.tsx
git commit -m "feat: add inline copy progress to RescueModal"
```
