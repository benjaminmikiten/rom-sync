# Playlist Platform Aliases Design

## Goal

Allow a playlist to target multiple platform folder names simultaneously. A playlist with `platform: [snes, sfc]` searches both `snes` and `sfc` ROM folders, so the same playlist works regardless of whether the user's library uses `sfc` or `snes` as the folder name.

## Context

`PlaylistEntry.platform` is used by `matcher.ts` to query the ROM database by platform folder name. Currently `platform` must be a single string. If the user's library uses `sfc` but a playlist targets `snes`, every entry is skipped. Platform aliases solve this by expanding entries at load time.

## Data Model

`Playlist.platform` changes type from `string | null` to `string[] | null`:

| Value | Meaning |
|---|---|
| `null` | Cross-platform playlist (no top-level platform field) |
| `['gba']` | Single-platform playlist — one-element array, same behavior as before |
| `['snes', 'sfc']` | Platform alias playlist — entries searched across all listed platforms |

`PlaylistEntry.platform` stays `string` — always a single resolved platform code.

### YAML Format

Existing single-platform syntax still works unchanged:
```yaml
platform: snes
```
Parsed as `['snes']`.

New alias syntax (YAML list):
```yaml
platform:
  - snes
  - sfc
```
or inline: `platform: [snes, sfc]`. Parsed as `['snes', 'sfc']`.

## Loader Behavior

`playlist-loader.ts` expands entries at load time. For a playlist with `platform: [snes, sfc]` and N entries, the loader produces `N × 2` `PlaylistEntry` objects — one copy per platform code:

```
{ raw: 'Super Mario World', platform: 'snes' }
{ raw: 'Super Mario World', platform: 'sfc' }
{ raw: 'Chrono Trigger', platform: 'snes' }
{ raw: 'Chrono Trigger', platform: 'sfc' }
```

## Matching and Sync Behavior

No changes to `matcher.ts` or `sync-previewer.ts`. The matcher builds separate Fuse indexes per platform as usual. Whichever platform folders exist in the library produce matches; the rest produce `status: 'none'`. The sync-previewer looks up `deviceConfig.platforms[rom.platform]` per match — if the device has `sfc` but not `snes`, the `snes` entries are skipped and the `sfc` entries copy normally.

## Display

`PlaylistsView.tsx` platform badge:
- `['gba']` → `GBA` (same as before)
- `['snes', 'sfc']` → `SNES / SFC`
- `null` → `cross-platform` (unchanged)

## Files Changed

| File | Change |
|---|---|
| `src/shared/types.ts` | `Playlist.platform: string | null` → `string[] | null` |
| `src/main/playlist-loader.ts` | Parse `platform` as string or array; expand entries per platform |
| `src/renderer/src/views/PlaylistsView.tsx` | Update platform badge display |
| `tests/playlist-loader.test.ts` | Update existing assertions; add 2 new alias tests |

No changes to `matcher.ts`, `sync-previewer.ts`, `playlist-resolver.ts`, or `PlaylistEditor.tsx`.

## Playlist Creation Form

The creation form still creates single-platform playlists. Users who want aliases edit the YAML file directly.

## Error Handling

- Non-string values in a `platform` list are silently filtered out (same defensive pattern as `DeviceConfig.playlists`)
- An empty `platform: []` is treated as cross-platform (`null`) — no platform filtering
- Invalid `platform` types (number, object) fall back to `null` (cross-platform), same as today
