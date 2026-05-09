# Device Config Folder Picker Design

## Goal

Replace free-text path inputs in the device config creation form with a folder-picker-driven workflow. Users specify a single ROMs root folder; platform paths are either auto-detected from subdirectories or derived from the root + platform code. No path is ever typed manually.

## Context

The device config creation form (just built) has platform rows with free-text path inputs. This redesign replaces those inputs entirely. The `writeDeviceConfig` backend is unchanged — it receives the same `DeviceConfig` shape regardless of how paths were constructed.

## Three Flows (all supported in one UI)

| Flow | When | How |
|---|---|---|
| B — Existing card | Root has subdirectories | Subfolders auto-detected, rows pre-populated, codes inferred from folder names |
| C — New card | Root has no subdirectories, or user adds rows | User types platform code; path derived as `{root}/{code}` |
| A — Edit specific platform | User wants a non-standard path | "Change" button on any row opens folder picker to override |

## Form Structure

### Device Name
Text input, pre-filled with volume name. Unchanged.

### ROMs Root Folder
- "Pick Folder" button — opens folder picker (no text input)
- After picking: shows selected path read-only + "Change" button
- Triggers auto-scan of immediate subdirectories (see Scanning below)
- Picking a new root clears all existing rows and re-scans from scratch

### Platform Rows
Each row contains:
1. **Platform code** — text input, always editable
2. **Path display** — one of:
   - Explicit path (set by scan or "Change" picker): shown in full, normal color
   - Derived preview (`{root}/{code}`): shown greyed out, updates as code is typed, applies at submit time
   - Neither root nor explicit path: shows a "Pick Folder" button inline
3. **"Change" button** — opens folder picker to set or override the path for this row only; does not affect platform code
4. **Remove (×) button** — shown when more than one row exists

### "+ Add Platform" button
Appends a new row with empty platform code and `null` path. If root is set, the greyed preview `{root}/{code}` updates as the user types the code.

### "Create Config" button
Disabled unless:
- Device name is non-empty, AND
- At least one row has a non-empty platform code AND a resolvable path (explicit path set, OR root is set so path can be derived)

## Behavior Details

### Scanning
When a root folder is picked, `api.listSubdirs(root)` is called. Each returned subdirectory name becomes a row:
```
{ id: <new>, platform: name.toLowerCase(), path: join(root, name) }
```
If no subdirectories are found, rows are cleared to one empty row (C flow).

### Picking a New Root
Clears all existing rows and re-scans. No merging of old rows — fresh start.

### Path Resolution at Submit
In `handleCreate`, each row's effective path is:
```typescript
const effectivePath = row.path ?? (romsRoot ? join(romsRoot, row.platform.trim()) : null)
```
Rows with no effective path are skipped. Rows with an empty platform code are skipped.

### "Change" on a Row
Opens folder picker. On selection, sets `row.path` to the picked folder. Does not modify `row.platform`.

### canCreate Logic
```typescript
const canCreate =
  deviceName.trim().length > 0 &&
  rows.some((r) => {
    const hasCode = r.platform.trim().length > 0
    const hasPath = r.path !== null || (romsRoot !== null && r.platform.trim().length > 0)
    return hasCode && hasPath
  })
```

## Row State Shape

```typescript
interface PlatformRow {
  id: number
  platform: string        // platform code, always editable
  path: string | null     // null = derive from root + platform at submit time
}
```

## Backend

### New: `listSubdirs(path)` in `device-detector.ts`

```typescript
export function listSubdirs(path: string): string[] {
  try {
    return readdirSync(path).filter((name) => {
      try { return statSync(join(path, name)).isDirectory() }
      catch { return false }
    })
  } catch {
    return []
  }
}
```

Returns directory names only (not full paths). Returns `[]` on any error (path doesn't exist, not readable, etc.).

### New IPC handler in `ipc.ts`
```typescript
ipcMain.handle('devices:list-subdirs', (_e, path: string) => listSubdirs(path))
```

### New preload entry in `preload/index.ts`
```typescript
listSubdirs: (path: string) => ipcRenderer.invoke('devices:list-subdirs', path),
```

### New type declaration in `api.ts`
```typescript
listSubdirs: (path: string) => Promise<string[]>
```

## Files Changed

| File | Change |
|---|---|
| `src/main/device-detector.ts` | Add `listSubdirs` function |
| `src/main/ipc.ts` | Register `devices:list-subdirs` handler, import `listSubdirs` |
| `src/preload/index.ts` | Expose `listSubdirs` via contextBridge |
| `src/renderer/src/api.ts` | Add `listSubdirs` type declaration |
| `src/renderer/src/views/DevicesView.tsx` | Replace platform rows section with folder-picker-driven UI |
| `tests/device-detector.test.ts` | Add tests for `listSubdirs` |

No new files. `writeDeviceConfig` and `readDeviceConfig` are unchanged.

## Error Handling

- `listSubdirs` returns `[]` on any error — no error surfaced in UI, empty rows state handles it gracefully
- `dialog:open-folder` already handles cancel (returns `null`) — no path change on cancel
- `writeDeviceConfig` backend validation (empty deviceName) is already in place
