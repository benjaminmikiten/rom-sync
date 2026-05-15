# Playlist-Device Assignment Design

## Goal

Allow users to assign playlists to a device from the device detail page. Assignments are stored in `rom-sync.yaml` on the SD card. The sync flow reads playlists directly from the device config, removing the now-redundant `playlistStems` IPC parameter.

## Context

`SyncView` currently hardcodes `playlistStems = []`, producing a preview that marks everything on the card as "To Delete" and nothing to copy. This feature replaces that stub with real playlist assignment driven by device config.

## Data Model

`DeviceConfig` gains a `playlists: string[]` field (playlist stems). It is always present in the TypeScript type; `readDeviceConfig` defaults to `[]` if the key is absent from the YAML (backwards compatible with existing cards). `writeDeviceConfig` omits the `playlists` key entirely when the list is empty, keeping the YAML clean.

Example `rom-sync.yaml` with assignments:
```yaml
device_name: My Anbernic Card
platforms:
  gba: /Roms/GBA
  snes: /Roms/SNES
playlists:
  - gba-favorites
  - snes-classics
```

## Device Detail UI

A "Playlists" section is added below the platform table on the device detail page (only when a config exists). It:

- Loads all available playlists via `api.listPlaylists()` on mount
- Renders each playlist as a checkbox (label = playlist name, value = stem)
- A playlist is checked if its stem is in `config.playlists`
- Toggling a checkbox immediately calls `api.writeDeviceConfig` with the updated list — no Save button
- On write failure: checkbox snaps back to its previous state, brief inline error shown
- If no playlists exist: shows "No playlists yet — create some in the Playlists tab."

## Sync Simplification

`sync:preview` and `sync:execute` IPC handlers drop the `playlistStems` parameter. They resolve playlists by reading `config.playlists` from the device config directly.

`SyncView` removes the `playlistStems` state. `api.previewSync` and `api.executeSync` take only `mountPoint: string`.

If a device has no playlists assigned, the preview correctly shows everything on the card as "To Delete" and nothing to copy — intentional, not a stub.

## Files Changed

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `playlists: string[]` to `DeviceConfig` |
| `src/main/device-detector.ts` | Parse and serialize `playlists` in `readDeviceConfig` / `writeDeviceConfig` |
| `src/main/ipc.ts` | Remove `playlistStems` param from `sync:preview` and `sync:execute` handlers; read from device config |
| `src/preload/index.ts` | Update `previewSync` and `executeSync` signatures (remove stems param) |
| `src/renderer/src/api.ts` | Update `previewSync` and `executeSync` type declarations |
| `src/renderer/src/views/SyncView.tsx` | Remove `playlistStems` state; update calls |
| `src/renderer/src/views/DevicesView.tsx` | Add Playlists section to device detail view |
| `tests/device-detector.test.ts` | Add tests for `playlists` field round-trip and missing-key default |

No new files. `computeSyncPreview`, `matchEntries`, and `sync-executor` are unchanged.

## Error Handling

- `readDeviceConfig`: missing `playlists` key → default to `[]`; invalid type (not an array) → default to `[]`
- Toggle write failure: revert checkbox state, show inline error message
- `sync:preview` with no playlists assigned: valid preview with empty `toCopy` and full `toDelete`
