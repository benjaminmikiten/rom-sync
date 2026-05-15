# Playlist Platform Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a playlist's `platform` field to accept a YAML list of platform codes, expanding entries at load time so the same playlist searches multiple platform folders simultaneously.

**Architecture:** `Playlist.platform` changes from `string | null` to `string[] | null`. The loader parses `platform` as either a string (wraps in array) or a YAML list, then expands entries — one copy per platform code. Matcher and sync-previewer are unchanged; they already work per-entry platform. The playlist list UI badge updates to join multiple platform codes.

**Tech Stack:** TypeScript, js-yaml, Vitest, React 18

---

## File Map

| File | Change |
|---|---|
| `src/shared/types.ts` | `Playlist.platform: string \| null` → `string[] \| null` |
| `src/main/playlist-loader.ts` | Parse `platform` as string or array; expand entries per platform code |
| `tests/playlist-loader.test.ts` | Update existing `platform` assertions; add 3 alias tests |
| `src/renderer/src/views/PlaylistsView.tsx` | Update platform badge to join array with ` / ` |

---

### Task 1: Update Playlist type, loader, and tests

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/playlist-loader.ts`
- Modify: `tests/playlist-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/playlist-loader.test.ts`. Make two edits:

**Edit 1 — update existing single-platform assertion** (currently line 30):
```typescript
expect(result.playlist!.platform).toBe('gba')
```
Change to:
```typescript
expect(result.playlist!.platform).toEqual(['gba'])
```

**Edit 2 — add a new `describe` block** at the end of the file (after the `loadAllPlaylists` describe block):

```typescript
describe('loadPlaylist — platform aliases', () => {
  it('expands entries for each platform in a YAML list', () => {
    const path = write('snes.yaml', `
name: SNES Best
platform:
  - snes
  - sfc
entries:
  - Super Mario World
  - Chrono Trigger
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toEqual(['snes', 'sfc'])
    expect(result.playlist!.entries).toHaveLength(4)
    const snesEntries = result.playlist!.entries.filter((e) => e.platform === 'snes')
    const sfcEntries = result.playlist!.entries.filter((e) => e.platform === 'sfc')
    expect(snesEntries).toHaveLength(2)
    expect(sfcEntries).toHaveLength(2)
    expect(snesEntries.map((e) => e.raw)).toContain('Super Mario World')
    expect(sfcEntries.map((e) => e.raw)).toContain('Chrono Trigger')
  })

  it('treats a single-element platform list identically to a platform string', () => {
    const path = write('gba-list.yaml', `
name: GBA Best
platform: [gba]
entries:
  - Castlevania - Aria of Sorrow (USA)
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toEqual(['gba'])
    expect(result.playlist!.entries).toHaveLength(1)
    expect(result.playlist!.entries[0].platform).toBe('gba')
  })

  it('treats an empty platform list as cross-platform', () => {
    const path = write('empty-plat.yaml', `
name: Cross Platform
platform: []
entries:
  gb:
    - Pokemon Red
`)
    const result = loadPlaylist(path)
    expect(result.valid).toBe(true)
    expect(result.playlist!.platform).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/playlist-loader.test.ts
```

Expected: failures — the `toEqual(['gba'])` assertion fails (currently returns `'gba'`), and the new alias tests fail (function doesn't support arrays yet).

- [ ] **Step 3: Update `Playlist.platform` type**

Open `src/shared/types.ts`. Find the `Playlist` interface:

```typescript
export interface Playlist {
  stem: string
  name: string
  platform: string | null   // null = cross-platform
  entries: PlaylistEntry[]
  includes: string[]        // stems of other playlists
  filePath: string
}
```

Change the `platform` line:

```typescript
export interface Playlist {
  stem: string
  name: string
  platform: string[] | null   // null = cross-platform; array = one or more platform codes
  entries: PlaylistEntry[]
  includes: string[]           // stems of other playlists
  filePath: string
}
```

- [ ] **Step 4: Update `playlist-loader.ts`**

Open `src/main/playlist-loader.ts`. The current single-platform parsing block is around lines 34–48:

```typescript
  const topPlatform = typeof doc['platform'] === 'string' ? doc['platform'] : null
  const includesRaw = ...
  const entries: PlaylistEntry[] = []

  if (topPlatform) {
    // single-platform: entries is a flat string list
    if (!Array.isArray(doc['entries'])) {
      issues.push({ severity: 'error', message: 'entries must be a list for single-platform playlists' })
    } else {
      for (const e of doc['entries'] as unknown[]) {
        if (typeof e === 'string') entries.push({ raw: e, platform: topPlatform })
      }
    }
  } else {
    // cross-platform: ...
  }
```

Replace only these two parts:

**Part A — replace the `topPlatform` declaration** (one line):
```typescript
const topPlatform = typeof doc['platform'] === 'string' ? doc['platform'] : null
```
With:
```typescript
  // Parse platform: accepts a string ('snes') or YAML list (['snes', 'sfc'])
  const rawPlatform = doc['platform']
  const parsedPlatforms: string[] | null =
    typeof rawPlatform === 'string' ? [rawPlatform] :
    Array.isArray(rawPlatform) ? (rawPlatform as unknown[]).filter((x): x is string => typeof x === 'string') :
    null
  // Treat empty array same as absent (cross-platform)
  const platforms = parsedPlatforms && parsedPlatforms.length > 0 ? parsedPlatforms : null
```

**Part B — replace the `if (topPlatform) {` branch** (everything from `if (topPlatform) {` up to but not including the `} else {` cross-platform branch):
```typescript
  if (platforms) {
    // single-platform or alias: entries is a flat string list, expanded per platform
    if (!Array.isArray(doc['entries'])) {
      issues.push({ severity: 'error', message: 'entries must be a list for single-platform playlists' })
    } else {
      for (const platformCode of platforms) {
        for (const e of doc['entries'] as unknown[]) {
          if (typeof e === 'string') entries.push({ raw: e, platform: platformCode })
        }
      }
    }
  } else {
    // cross-platform: entries is either a platform-keyed map or a list of { raw, platform } objects
```

Leave `includesRaw`, `entries`, and the cross-platform `else` branch untouched.

Also update the `return` statement at the bottom of `loadPlaylist` to use `platforms` instead of `topPlatform`:

```typescript
  return {
    valid: true,
    issues,
    playlist: {
      stem,
      name: doc['name'] as string,
      platform: platforms,
      entries,
      includes: includesRaw,
      filePath
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/playlist-loader.test.ts
```

Expected: all tests PASS. The suite should now have 3 more tests than before (the 3 alias tests), and the updated `platform` assertion should pass.

- [ ] **Step 6: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. TypeScript may surface errors in `PlaylistsView.tsx` due to the type change — those are fixed in Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/playlist-loader.ts tests/playlist-loader.test.ts
git commit -m "feat: playlist platform field accepts array for multi-platform aliases"
```

---

### Task 2: Update PlaylistsView badge display

**Files:**
- Modify: `src/renderer/src/views/PlaylistsView.tsx`

- [ ] **Step 1: Update the platform badge**

Open `src/renderer/src/views/PlaylistsView.tsx`. Find this line inside the playlist list item (currently around line 131):

```typescript
{pl.platform ? pl.platform.toUpperCase() : 'cross-platform'} · {pl.entries.length} entries
```

Change it to:

```typescript
{pl.platform ? pl.platform.map((p) => p.toUpperCase()).join(' / ') : 'cross-platform'} · {pl.entries.length} entries
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/PlaylistsView.tsx
git commit -m "feat: display platform aliases joined with / in playlist list"
```
