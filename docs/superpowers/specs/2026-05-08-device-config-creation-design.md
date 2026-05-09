# Device Config Creation Design

## Goal

When a user selects a mounted volume that has no `rom-sync.yaml`, offer an inline form to create one — device name plus platform-to-path mappings — and write the file to the card.

## Context

`DevicesView` currently shows a red error box ("rom-sync.yaml not found on this volume") when the config file is missing, with no recovery path. This change replaces that dead-end with a setup form so users can configure a new SD card without leaving the app.

## Trigger Condition

The creation form appears **only** when `readDeviceConfig` returns `error === 'rom-sync.yaml not found on this volume'` and `config === null`. Any other error (YAML parse failure, malformed structure) continues to show the red error message — creation is not appropriate in those cases.

## UI: "Set Up This Device" Form

Replaces the missing-file error message. Contains:

1. **Device name input** — pre-filled with `volume.name` as a default. Editable.
2. **Platform rows** — a dynamic list of `[platform code] → [path on card]` pairs.
   - Starts with one empty row.
   - "Add Platform" button appends a new empty row.
   - Each row has a remove (×) button; rows can be removed freely.
   - Platform code: plain text input (e.g. `gba`, `snes`).
   - Path: plain text input (e.g. `/Roms/GBA`).
3. **Create Config button** — disabled if device name is empty or no platform rows exist. On click: calls `api.writeDeviceConfig`, then re-calls `api.readDeviceConfig` to reload. On success: transitions to the normal config detail view. On failure: shows an inline error message below the button.

## Success Flow

1. User selects a volume with no `rom-sync.yaml` → sees the setup form.
2. User fills in device name and at least one platform row.
3. User clicks "Create Config".
4. File is written to `{mountPoint}/rom-sync.yaml`.
5. `readDeviceConfig` is called again; returns the new config.
6. View transitions to the normal device detail (name, space, platform table).

## Backend

### `device-detector.ts` — new function

```typescript
export function writeDeviceConfig(
  mountPoint: string,
  config: DeviceConfig
): { error: string | null }
```

- Serializes `config` to YAML using `js-yaml` (`dump`):
  ```yaml
  device_name: My Card
  platforms:
    gba: /Roms/GBA
    snes: /Roms/SNES
  ```
- Writes to `{mountPoint}/rom-sync.yaml` using `writeFileSync`.
- Returns `{ error: null }` on success, `{ error: message }` on any exception.

### `ipc.ts` — new handler

```typescript
ipcMain.handle('devices:write-config', (_e, mountPoint: string, config: DeviceConfig) =>
  writeDeviceConfig(mountPoint, config)
)
```

### `preload/index.ts` — new bridge method

```typescript
writeDeviceConfig: (mountPoint: string, config: DeviceConfig) =>
  ipcRenderer.invoke('devices:write-config', mountPoint, config)
```

### `api.ts` — new typed declaration

```typescript
writeDeviceConfig(mountPoint: string, config: DeviceConfig): Promise<{ error: string | null }>
```

## Files Changed

| File | Change |
|---|---|
| `src/main/device-detector.ts` | Add `writeDeviceConfig` function |
| `src/main/ipc.ts` | Register `devices:write-config` handler |
| `src/preload/index.ts` | Expose `writeDeviceConfig` via contextBridge |
| `src/renderer/src/api.ts` | Add type declaration |
| `src/renderer/src/views/DevicesView.tsx` | Replace missing-file error with setup form |

No new files. No changes to existing config reading, sync preview, or sync execution.

## Error Handling

- Write errors (permissions, card read-only, etc.) are caught in `writeDeviceConfig` and returned as `{ error: message }`. The UI displays the message inline below the Create button.
- The form does not attempt to validate platform codes or paths — the existing `readDeviceConfig` validation will catch structural issues on reload.
- Empty device name or zero platform rows: Create button is disabled (client-side guard only).
