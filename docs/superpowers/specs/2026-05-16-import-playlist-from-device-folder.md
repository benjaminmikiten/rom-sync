# Import Playlist from Device Folder

**Date:** 2026-05-16  
**Status:** Approved

## Problem

When a device folder (e.g., `/ROMS/DS`) already contains ROMs that are also in the local library, the sync engine has no record of them and will delete them on the next sync. The user needs a way to create a playlist that captures "what's already on this device folder" so those files are protected going forward.

## Goal

In the Devices view, for each platform row on a configured device, allow the user to create a playlist by scanning that platform's folder on the device — using the device config's existing path mappings to infer the folder and platform automatically.

## Out of Scope

- Auto-assigning the created playlist to the device (separate step, done manually in Devices view)
- Importing files not already in the local library
- A review/edit step before writing the playlist

## Approach

Single atomic IPC call. The main process does all the work: reads device config, scans the folder, normalizes filenames, writes the YAML. The UI adds an inline name prompt per platform row and calls the handler.

## Data Flow

```
UI (mountPoint, platform, name)
  → IPC: playlists:import-from-device
    → readDeviceConfig(mountPoint)     — get platform → path mapping
    → look up folder path for platform
    → readdirSync(folder)              — files only, skip hidden + .txt
    → normalizeTitle(filename)         — same normalization as library scanner
    → deduplicate normalized titles
    → slugify name → stem
    → write YAML to playlists dir
  → return { stem } | { error }
```

## Files Changed

| File | Change |
|---|---|
| `src/main/ipc.ts` | New `playlists:import-from-device` handler |
| `src/preload/index.ts` | Expose `importPlaylistFromDevice` via `ipcRenderer.invoke` |
| `src/renderer/src/api.ts` | Add method signature to `Window['api']` declaration |
| `src/renderer/src/views/DevicesView.tsx` | Inline name form + "Import as playlist" button per platform row |

## Backend: `playlists:import-from-device`

**Input:** `mountPoint: string, platform: string, name: string`  
**Output:** `{ stem: string } | { error: string }`

Steps:
1. Validate `name.trim()` is non-empty — return error if not (IPC validates, not just UI)
2. Call `readDeviceConfig(mountPoint)` — return error if config missing/invalid
3. Look up `config.platforms[platform]` — return error if platform not in mapping
4. Resolve full folder path: `join(mountPoint, platformPath)`
5. `readdirSync` the folder wrapped in try/catch; filter to files only (skip entries starting with `.`, skip `.txt` extensions) — return error if folder unreadable
6. Apply `normalizeTitle()` to each filename
7. Deduplicate normalized titles (preserve order, drop later duplicates)
8. Generate stem: `name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
9. If `stem.yaml` already exists in playlists dir, return `{ error: 'A playlist with that name already exists' }`
10. Write YAML as manual string (consistent with `playlists:create`, not `yaml.dump`):
    ```
    name: <name>
    platform: <platform>
    entries:
      - <normalized title>
      - ...
    ```
11. Return `{ stem }`

## Preload + API

```ts
// preload/index.ts
importPlaylistFromDevice: (mountPoint: string, platform: string, name: string) =>
  ipcRenderer.invoke('playlists:import-from-device', mountPoint, platform, name)

// renderer/src/api.ts (Window['api'] declaration)
importPlaylistFromDevice: (mountPoint: string, platform: string, name: string) =>
  Promise<{ stem: string } | { error: string }>
```

## UI: DevicesView platform rows

Shown only when `selected.config` exists (configured device).

- Each platform row in the mappings table gets an "Import as playlist" button
- Clicking opens an inline form (only one open at a time; opening a second closes the first)
- The name input is pre-filled with the platform code uppercased (e.g., `"DS"` for `nds`) as a suggestion
- "Create" calls `importPlaylistFromDevice(mountPoint, platform, name)`
- On success: show `"Playlist '<stem>' created"` and collapse the form
- On error: show the error message inline
- The chokidar watcher on the playlists dir fires `playlists:changed` automatically — no extra refresh needed

## Error Cases

| Condition | Error message |
|---|---|
| Device config missing or invalid | Forwarded from `readDeviceConfig` |
| Platform not in config mappings | `"Platform '<platform>' not found in device config"` |
| Folder unreadable / doesn't exist | `"Could not read folder: <path>"` |
| Name is empty | `"Name is required"` (validated in both UI and IPC) |
| Stem collision | `"A playlist with that name already exists"` |
