# Sync Preview Platform Grouping

**Date:** 2026-05-16  
**Status:** Approved

## Problem

The sync preview's "To Delete" and "Skipped" lists are flat — they show filenames and entry titles with no context. The user cannot tell which platform each item belongs to, or why a skipped entry was skipped. This makes it impossible to diagnose why some platforms lack playlist coverage before running a sync.

There are two distinct skip reasons that are currently conflated:
1. **No library match** — the playlist entry title didn't match any ROM in the local library
2. **Platform not mapped** — the ROM was found in the library but the device config has no path mapping for that platform

The second case is the primary signal for "this platform has no coverage on this device."

## Goal

Group "To Delete" and "Skipped" by platform in the sync preview, and surface the skip reason per entry in the Skipped list. "To Copy" stays flat — no diagnostic context needed there.

## Out of Scope

- Grouping by playlist (provenance tracking not needed — platform grouping is sufficient)
- Collapsible/expandable tree UI (always expanded, scroll-limited)
- Changes to sync execution behavior

## Approach

Enrich the `SyncPreview` data types so the renderer has everything it needs. The previewer already knows the platform and skip reason at computation time — this is just threading that data through. The renderer groups the enriched data client-side.

## Data Flow

```
computeSyncPreview()
  toDelete: push { platform: platformCode, path: join(dir, file) }
            ↑ uses Object.entries() instead of Object.values()

  skipped:  push { match, reason: 'no-match' }
            push { match, reason: 'platform-not-mapped' }
            ↑ two existing if-branches, now labeled

→ SyncPreview { toCopy, toDelete, skipped, totalCopyBytes, availableBytes }

sync-executor.ts
  for (const { path: filePath } of preview.toDelete)  ← one-line update

SyncPreview.tsx
  toDelete: group by platform → render platform sub-headers + filenames
  skipped:  group by platform → render platform sub-headers + entry title + reason label
```

## Files Changed

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `SkipReason`, `SkippedEntry`; update `SyncPreview` |
| `src/main/sync-previewer.ts` | Use `Object.entries`, push enriched `toDelete` and `skipped` |
| `src/main/sync-executor.ts` | Destructure `{ path }` from `toDelete` items |
| `src/renderer/src/components/SyncPreview.tsx` | Render grouped "To Delete" and "Skipped" |

## Type Changes (`shared/types.ts`)

```ts
export type SkipReason = 'no-match' | 'platform-not-mapped'

export interface SkippedEntry {
  match: MatchResult
  reason: SkipReason
}

export interface SyncPreview {
  toCopy: ResolvedRom[]
  toDelete: { platform: string; path: string }[]  // was: string[]
  skipped: SkippedEntry[]                          // was: MatchResult[]
  totalCopyBytes: number
  availableBytes: number
}
```

## Backend: `sync-previewer.ts`

**Delete loop** — switch `Object.values` → `Object.entries` to get the platform code:

```ts
for (const [platformCode, platformRelPath] of Object.entries(deviceConfig.platforms)) {
  const dir = join(cardMountPoint, platformRelPath)
  if (!existsSync(dir)) continue

  const keepSet = keepByDir.get(dir) ?? new Set()
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    continue
  }

  for (const file of files) {
    if (!keepSet.has(file)) {
      toDelete.push({ platform: platformCode, path: join(dir, file) })
    }
  }
}
```

**Skip pushes** — label each with its reason:

```ts
// branch 1: status === 'none' or !match.rom
skipped.push({ match, reason: 'no-match' })

// branch 2: platform not in deviceConfig.platforms
skipped.push({ match, reason: 'platform-not-mapped' })
```

## Backend: `sync-executor.ts`

Delete loop — destructure `path` from each item:

```ts
for (const { path: filePath } of preview.toDelete) {
  try {
    unlinkSync(filePath)
    deletedCount++
  } catch (e: unknown) {
    errors.push(`Failed to delete ${filePath}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
```

## Renderer: `SyncPreview.tsx`

### To Delete — grouped by platform

Group `preview.toDelete` by `platform`. For each platform group, render a sub-header with the platform code and count, then the filenames.

```
To Delete (10)
  nds  (3)
    Game A.nds
    Game B.nds
    Game C.nds
  gba  (7)
    Metroid Fusion.gba
    ...
```

### Skipped — grouped by platform

Group `preview.skipped` by platform. The group key:
- If `reason === 'platform-not-mapped'`: use `s.match.rom!.platform` (ROM was found, platform is known)
- If `reason === 'no-match'`: use the first value of `s.match.entry.platform` (normalize `string | string[]` → take first element if array)

Each entry shows its title and a dim reason label:
- `'no-match'` → `· no library match`
- `'platform-not-mapped'` → `· platform not on device`

```
Skipped (5)
  gba  (3)
    Contra Advance  · no library match
    Castlevania Aria  · no library match
  snes  (2)
    Chrono Trigger  · platform not on device
    Super Metroid  · platform not on device
```

### Visual structure

Both grouped sections use the same outer box style as today (background `#1e1e1e`, `borderRadius: 6`, `padding: 12`). Inside:
- Platform sub-header: bold platform code + count, `color: #ccc`, `fontSize: 12`, `marginTop: 8`
- Items indented with `paddingLeft: 12`, `color: '#aaa'`, `fontSize: 12`
- Reason label: `color: '#555'`, `fontSize: 11`, inline after the title
- Outer `maxHeight: 200` + `overflowY: auto` preserved (already present)

"To Copy" is unchanged — flat list, no grouping needed.

## Error Cases / Edge Cases

| Case | Handling |
|---|---|
| Entry with `platform: string[]` and `reason: 'no-match'` | Take `platform[0]` as group key |
| Platform group with zero items | Won't occur — only push when there are items |
| `toDelete` items on a platform with no playlist coverage at all | Show under that platform, same as any other |
| Empty `toDelete` or empty `skipped` | Existing "0 items" display unchanged |
