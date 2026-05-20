# Rescue from To Delete — Design Spec

**Date:** 2026-05-19
**Feature:** Multi-select rescue actions on "To Delete" items in the Sync preview

---

## Overview

When a user previews a sync, the "To Delete" panel shows files present on the device that aren't covered by any playlist. This feature lets the user select one or more of those files and either copy them into the master library, add them to a playlist, or both — then automatically re-runs the preview so the rescued items are no longer marked for deletion.

---

## Selection UI (SyncPreview.tsx)

The To Delete panel gains:

- A **checkbox on each ROM row** (left of the filename)
- A **"select all" checkbox on each platform group header** that toggles all items in that group
- A **rescue toolbar** that appears at the bottom of the To Delete panel when ≥1 item is checked, showing: `"Rescue N items →"` button (count updates live)

Selection state (`selectedPaths: Set<string>`) lives inside `SyncPreviewPanel`. The toolbar button opens the Rescue Modal.

`SyncPreviewPanel` receives an `onRescueComplete: () => void` callback prop from `SyncView`. After the rescue succeeds, the modal calls this callback, which triggers `handlePreview()` in `SyncView` to re-run the sync preview automatically.

---

## Rescue Modal (RescueModal.tsx — new component)

An overlay modal that opens when the user clicks "Rescue N items →".

### On mount, fetches:
- `api.getSettings()` — to get `libraryPath`
- `api.listPlaylists()` — to populate the playlist picker

### Copy to Library section
- Toggle (default: ON)
- Groups selected items by platform
- For each platform group, shows: `{platform} → {libraryPath}/{platform}/` with an **edit button** (opens existing `openFolderPicker` dialog) to change the destination folder
- Lists the filenames landing in that folder for confirmation

### Add to Playlist section
- Toggle (default: ON)
- Dropdown of existing playlists + a **"New playlist…"** option at the bottom
- Selecting "New playlist…" reveals an inline name text field
  - Platform is inferred automatically: the shared platform if all selected ROMs are the same platform; left blank (cross-platform) if mixed
- All selected ROMs are added to the chosen playlist as normalized titles (backend handles normalization via `normalizeTitle`)
- No platform validation when adding to an existing playlist — if the user selects GBA ROMs and picks an SNES playlist, that's their decision; the app just appends the titles

### Confirm flow
1. If "Copy to Library" is ON: call `api.copyFromDevice([{ src, dest }, …])`
2. If "Add to Playlist" is ON and an existing playlist was chosen: call `api.addPlaylistEntries(stem, titles[])`
3. If "Add to Playlist" is ON and "New playlist…" was chosen: call `api.createPlaylist(name, platform, rawEntries)`
4. On success: close modal, call `onRescueComplete()` → preview re-runs
5. On error: show inline error in modal, do not close

---

## Backend & IPC

### New handler: `sync:copy-from-device`

```ts
ipcMain.handle('sync:copy-from-device', (_e, pairs: { src: string; dest: string }[]) => {
  // mkdirSync dest dirs, copyFileSync each pair
  // returns { copied: number; errors: string[] }
})
```

Follows the same pattern as `executeSyncPlan` in `sync-executor.ts`. Lives in `ipc.ts`.

### New handler: `playlists:add-entries`

```ts
ipcMain.handle('playlists:add-entries', (_e, stem: string, entries: string[]) => {
  // Read existing YAML, append new entries (deduplicating), write back
  // returns { error: string | null }
})
```

Reads the playlist YAML, finds the `entries:` array, appends only entries not already present (string comparison on normalized titles), writes back. Lives in `ipc.ts`.

### Existing handler reused: `playlists:create`
No changes needed — the modal calls this for the "New playlist…" case, passing the name, inferred platform, and ROM titles joined with newlines.

### api.ts additions
```ts
copyFromDevice: (pairs: { src: string; dest: string }[]) => Promise<{ copied: number; errors: string[] }>
addPlaylistEntries: (stem: string, entries: string[]) => Promise<{ error: string | null }>
```

`preload/index.ts` gets corresponding `ipcRenderer.invoke` calls.

---

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/components/SyncPreview.tsx` | Add checkboxes, select-all headers, rescue toolbar |
| `src/renderer/src/components/RescueModal.tsx` | New component — the confirmation modal |
| `src/renderer/src/views/SyncView.tsx` | Pass `onRescueComplete` → `handlePreview` callback to `SyncPreviewPanel` |
| `src/main/ipc.ts` | Add `sync:copy-from-device` and `playlists:add-entries` handlers |
| `src/preload/index.ts` | Expose two new IPC methods |
| `src/renderer/src/api.ts` | Add `copyFromDevice` and `addPlaylistEntries` to API type |

---

## Out of Scope

- Bulk rescue of all To Delete items at once (no "rescue everything" button — user must select)
- Editing normalized titles before adding to playlist
- Undo / rollback after rescue
- Scanning the library after copy (user triggers a rescan separately if needed)
