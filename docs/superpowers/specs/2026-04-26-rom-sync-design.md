# ROM Sync — Design Spec
_Date: 2026-04-26_

## Overview

ROM Sync is a macOS Electron app for managing curated playlists of ROM files and syncing them to emulator SD cards. The user maintains a large ROM collection on external storage (organized in ESDE conventions) and wants to define named, composable playlists that get synced — strictly and one-way — to one or more mounted SD cards.

---

## Tech Stack

| Concern | Choice |
|---|---|
| App shell | Electron |
| UI | React + TypeScript |
| Library index | SQLite via `better-sqlite3` |
| Fuzzy matching | `fuse.js` |
| Global config | `electron-store` (JSON) |
| Playlist / device config | YAML (`js-yaml`) |
| File watching | `chokidar` |

---

## Data Architecture

### App Data Directory
`~/Library/Application Support/rom-sync/`

```
config.json          # global preferences
playlists/           # one YAML file per playlist
  gba-tiny-best-set.yaml
  pokemon-hacks.yaml
library.db           # SQLite ROM index
logs/                # post-sync log files
```

### Global Config (`config.json`)
```json
{
  "libraryPath": "/Volumes/ExternalSSD/Roms",
  "fuzzyMatchThreshold": 0.6
}
```

### SD Card Config (`rom-sync.yaml` — lives on the card)
```yaml
device_name: MiSTer FPGA
platforms:
  gba: /games/gba
  snes: /games/snes
  gb: /games/gb
```

### SQLite Library Index (`library.db`)

Table: `roms`
```sql
CREATE TABLE roms (
  id            INTEGER PRIMARY KEY,
  platform      TEXT NOT NULL,
  title         TEXT NOT NULL,       -- inferred No-Intro title (normalized)
  filename      TEXT NOT NULL,
  path          TEXT NOT NULL,
  size_bytes    INTEGER,
  matched_title TEXT,                -- reserved for future DAT verification
  scanned_at    INTEGER NOT NULL     -- unix timestamp
);
CREATE INDEX idx_roms_platform ON roms(platform);
CREATE INDEX idx_roms_title ON roms(title);
```

Title inference: strip region tags `(USA)`, revision markers `(Rev 1)`, and file extension. Then normalize: lowercase, strip punctuation, collapse whitespace. Both stored and query-time values are normalized before comparison.

### Playlist YAML

**Single-platform:**
```yaml
name: GBA Tiny Best Set
platform: gba
entries:
  - Castlevania - Aria of Sorrow (USA)
  - Metroid Fusion (USA)
includes:
  - pokemon-hacks    # references another playlist by filename stem
```

**Cross-platform:**
```yaml
name: Pokemon Collection
entries:
  gb:
    - Pokemon Red (USA)
    - Pokemon Blue (USA)
  gbc:
    - Pokemon Gold (USA)
  gba:
    - Pokemon FireRed (USA)
    - Pokemon Emerald (USA)
includes:
  - some-other-playlist
```

Rules:
- `entries` is a flat list of strings when `platform` is present at the top level.
- `entries` is a platform-keyed map when no top-level `platform` is present.
- `includes` is a list of playlist filename stems (without `.yaml`). References are resolved recursively and flattened at sync/resolve time. Circular references are detected and reported as validation errors.
- Platform keys in entries must be valid ESDE abbreviations (warning if unrecognized, not a hard error).

---

## Library Scanning

Triggered manually via "Rescan Library" button. The main process:

1. Walks every subdirectory under `libraryPath`. Each subdirectory name is treated as a platform abbreviation.
2. For each file, infers a `title` by stripping region/revision/extension from the filename.
3. Upserts into the `roms` table (keyed on `path`).
4. Reports live progress (current file count) to the renderer during scan.

The library is scanned from ESDE-style external storage:
```
/Roms/
  gba/
    Castlevania - Aria of Sorrow (USA).zip
  snes/
    Super Metroid (USA).zip
```

---

## Fuzzy Matching

Matching runs at resolve time — when a playlist's entry list is displayed or a sync is previewed. It is never run during scanning.

For each playlist entry:
1. Normalize the entry string (lowercase, strip punctuation, collapse whitespace).
2. Run `fuse.js` against the `title` column in SQLite, filtered by platform.
3. Bucket the result:
   - **Exact** — normalized strings match exactly.
   - **Fuzzy** — best candidate score is within the configured threshold. The candidate filename is shown alongside the original entry for user verification.
   - **No match** — no candidate meets the threshold. Entry is flagged; it is listed as a warning and skipped during sync (sync is not blocked).

The fuzzy threshold (default `0.6`) is configurable in Settings.

---

## Playlist Validation

Validation runs:
- On app startup (all playlists loaded)
- Whenever a file in `playlists/` changes on disk (via `chokidar` watcher)
- When a device is selected (validates its `rom-sync.yaml`)
- On demand via "Validate All" action in the Playlists view

**Validation checks:**
- YAML parse errors
- Missing required fields (`name`; valid `entries` structure per format)
- `includes` references to non-existent playlists
- Circular `includes` chains
- Unrecognized platform abbreviations in cross-platform `entries` (warning only)
- SD card config: missing `device_name` or `platforms` map; invalid platform paths

**Error surfacing:**
- Each playlist in the sidebar list shows a warning icon if invalid.
- The playlist editor shows an inline error panel at the top with a specific, human-readable description of each error (including line number where possible).
- The Devices view shows a red banner with the specific error if `rom-sync.yaml` is malformed.

---

## Device Management

- The Devices view lists currently mounted volumes.
- Selecting a volume reads `rom-sync.yaml` from its root. If the file is absent or malformed, an error is shown.
- The device detail view shows: device name, platform-to-folder mappings, and assigned playlists.
- Playlists are assigned/unassigned to a device in this view.
- Assignment state is stored in `config.json` (keyed by device name).
- Multiple SD cards can be mounted simultaneously; the user selects one at a time to manage or sync.

---

## Sync Engine

### Pre-Sync Preview

Before any files are touched, the app:

1. Resolves all playlists assigned to the selected device (flattening `includes` recursively).
2. Fuzzy-matches all entries against the library index.
3. Maps each matched ROM to its destination path via the device's platform mappings.
4. Computes three lists:
   - **To copy** — matched ROMs not yet present on the SD card (by filename).
   - **To delete** — files present in the device's mapped platform directories (as defined in `rom-sync.yaml`) that are not in any resolved playlist. Only files inside these mapped directories are ever considered for deletion; no other paths on the SD card are touched.
   - **Skipped** — unmatched/unresolved entries (warnings).
5. Calculates total bytes to copy and queries the SD card's available disk space.
   - If projected post-sync usage exceeds available space: shows a warning with exact numbers and disables "Sync Now" until resolved.
   - Shows a storage bar: current used / total capacity / projected used after sync.

### Sync Execution

1. Creates any missing destination platform directories on the SD card.
2. Copies files one at a time; progress bar shows current filename and count.
3. If a copy fails (e.g. SD card full mid-sync): halts immediately, reports the error, leaves already-copied files in place. Does not proceed to deletions.
4. After all copies succeed: deletes files in the "to delete" list.
5. Writes a post-sync log to `logs/` (timestamped filename) with: files copied, files deleted, files skipped, any errors.

**Sync is strictly one-way:** external storage → SD card. Files on the SD card are never read back into the library.

---

## UI Structure

Left sidebar navigation with five views:

### Library
- Browse all indexed ROMs, grouped by platform with counts.
- Search/filter across the index.
- "Rescan Library" button with last-scanned timestamp.
- Shows total ROM count per platform.

### Playlists
- List of all playlists with validation status indicators.
- "Validate All" action.
- Playlist editor:
  - Inline error panel (if invalid).
  - Entry list with match status badges (exact / fuzzy / not found).
  - Fuzzy matches show the resolved filename for verification.
  - Search-and-add from library index.
  - Paste bulk list (one title per line).
  - Manage `includes` (add/remove other playlists).
- Create / rename / delete playlists.

### Devices
- List of mounted volumes.
- Select a volume to view device detail.
- Device detail: name, platform mappings, assigned playlists.
- Assign / unassign playlists.
- Validation error banner if `rom-sync.yaml` is malformed.

### Sync
- Selected device and assigned playlists shown at top.
- Pre-sync preview: to copy / to delete / skipped lists.
- Storage bar with overflow warning.
- "Sync Now" button (disabled if storage overflow detected).
- Progress view during sync.
- Post-sync summary report.

### Settings
- External library path picker.
- Fuzzy match threshold slider with live preview label.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Library path not set or missing | Settings view flagged on startup; Library and Sync disabled |
| No SD card selected | Sync view prompts user to select a device first |
| `rom-sync.yaml` missing on card | Error banner in Devices view; sync blocked |
| ROM not found in library | Flagged in playlist editor and sync preview; skipped, sync continues |
| Circular playlist includes | Validation error; playlist marked invalid |
| Copy fails mid-sync | Sync halts; no deletions run; error reported |
| SD card would be overfilled | Sync blocked with storage breakdown shown |
| YAML parse error in playlist | Validation error with line number; playlist marked invalid |
