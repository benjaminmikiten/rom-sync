# Playlist Editor Open-in-Editor + Rescue Copy Progress — Design Spec

**Date:** 2026-05-22
**Features:**
1. "Open in Editor" button in the PlaylistEditor view
2. Inline copy progress display in the RescueModal

---

## Feature 1: Open in Editor (PlaylistEditor)

### Problem
The PlaylistEditor view shows match results for a playlist but offers no way to directly edit the underlying YAML file. Users must use the "Open Folder" button in the list view and navigate manually.

### Design

**`PlaylistEditor` props gain `filePath: string`.**

`PlaylistsView` already holds the full `Playlist` object (which has `filePath: string`) when it opens the editor. It passes `filePath={selected.filePath}` to `PlaylistEditor`.

**UI:** A new "Open in Editor" button in the `PlaylistEditor` header row, positioned after the playlist name:

```
← My GBA Playlist          [Open in Editor]
```

Clicking calls `api.openPlaylistFile(filePath)`.

**IPC handler:** `playlists:open-file` in `src/main/ipc.ts`:
```ts
ipcMain.handle('playlists:open-file', (_e, filePath: string) => shell.openPath(filePath))
```
`shell` is already imported in `ipc.ts`. Opens the file in the OS default application for `.yaml` files.

### Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/PlaylistEditor.tsx` | Add `filePath` prop; add "Open in Editor" button in header |
| `src/renderer/src/views/PlaylistsView.tsx` | Pass `filePath={selected.filePath}` to `PlaylistEditor` |
| `src/main/ipc.ts` | Add `playlists:open-file` handler |
| `src/preload/index.ts` | Expose `openPlaylistFile(filePath)` |
| `src/renderer/src/api.ts` | Add `openPlaylistFile: (filePath: string) => Promise<void>` type |

---

## Feature 2: Rescue Copy Progress

### Problem
When the user clicks "Rescue" in `RescueModal`, the modal shows "Working…" with no feedback about how many files have been copied, which file is current, or how long is left.

### Design

#### Backend — `src/main/rescue.ts`

`copyFilesFromDevice` gains an optional `onProgress` callback:

```ts
export function copyFilesFromDevice(
  pairs: { src: string; dest: string }[],
  onProgress?: (progress: { copied: number; total: number; currentFile: string }) => void
): { copied: number; errors: string[] }
```

Called after each successful copy with `{ copied, total: pairs.length, currentFile: filename }`. Also called on error with the failing filename so the counter stays accurate.

#### Backend — `src/main/ipc.ts`

The `sync:copy-from-device` handler passes a progress callback that pushes events to the renderer:

```ts
ipcMain.handle('sync:copy-from-device', (_e, pairs) =>
  copyFilesFromDevice(pairs, (progress) => {
    mainWindow.webContents.send('rescue:copy-progress', progress)
  })
)
```

This mirrors the existing `sync:execute` → `sync:progress` pattern exactly.

#### Shared type — `src/shared/types.ts`

```ts
export interface RescueCopyProgress {
  copied: number
  total: number
  currentFile: string
}
```

#### Frontend — `src/preload/index.ts`

```ts
onRescueCopyProgress: (cb: (p: unknown) => void) => {
  ipcRenderer.on('rescue:copy-progress', (_e, p) => cb(p))
  return () => ipcRenderer.removeAllListeners('rescue:copy-progress')
},
```

#### Frontend — `src/renderer/src/api.ts`

```ts
onRescueCopyProgress: (cb: (p: RescueCopyProgress) => void) => () => void
```

#### Frontend — `src/renderer/src/components/RescueModal.tsx`

New state:
```ts
const [copyProgress, setCopyProgress] = useState<RescueCopyProgress | null>(null)
const [copyStartTime, setCopyStartTime] = useState<number | null>(null)
```

Subscribe on mount:
```ts
useEffect(() => {
  const unsub = api.onRescueCopyProgress(p => {
    setCopyProgress(p as RescueCopyProgress)
  })
  return unsub
}, [])
```

Reset on each `handleConfirm` call:
```ts
setCopyProgress(null)
setCopyStartTime(Date.now())
```

**Inline progress section** — renders inside the modal when `working && copyEnabled && copyProgress`:

```
[████████░░░░░░░░]  5 / 12 files
Pokemon Emerald Seaglass.gba
~1m 20s remaining
```

- Progress bar: `width: (copied/total * 100)%` in a fixed-height div
- Count: `{copied} / {total} files`
- Current file: filename only (no path), truncated with `textOverflow: ellipsis`
- ETA: only shown once `copied >= 1`. Formula: `Math.round(((total - copied) * (Date.now() - startTime)) / copied / 1000)` seconds, formatted as `~Xm Ys remaining` or `~Xs remaining`
- Once copy completes (copied === total), shows "Copy complete ✓" and the section stays visible until the modal closes

**Positioning:** appears between the "Add to Playlist" section and the error/button row, only while `working` is true.

### Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `RescueCopyProgress` interface |
| `src/main/rescue.ts` | Add `onProgress` param to `copyFilesFromDevice` |
| `src/main/ipc.ts` | Pass progress callback in `sync:copy-from-device` handler |
| `src/preload/index.ts` | Expose `onRescueCopyProgress` |
| `src/renderer/src/api.ts` | Add `onRescueCopyProgress` type |
| `src/renderer/src/components/RescueModal.tsx` | Subscribe to progress; render inline progress section |

---

## Out of Scope

- Pausing or cancelling an in-progress rescue copy
- Per-file error display in the progress section (errors still shown in the existing error area after completion)
- Progress for the playlist-add phase (near-instant, not worth tracking)
