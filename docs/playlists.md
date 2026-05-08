# ROM Sync Playlist Format

Playlists are YAML files stored in:
```
~/Library/Application Support/rom-sync/playlists/
```

The filename (without `.yaml`) is the playlist's **stem**, used for `includes` references and the URL slug in the UI. Use lowercase kebab-case: `gba-favorites.yaml`, `all-time-classics.yaml`.

---

## Single-Platform Playlist

Use this when all games are on the same console.

```yaml
name: GBA Favorites
platform: gba
entries:
  - Castlevania - Aria of Sorrow
  - Final Fantasy VI Advance
  - Metroid Fusion
  - Pokemon Emerald
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | Display name shown in the app |
| `platform` | yes (for single-platform) | Platform code — see [Platform Codes](#platform-codes) |
| `entries` | yes | List of game titles (plain strings) |
| `includes` | no | Stems of other playlists to merge in |

---

## Cross-Platform Playlist

Use this when your playlist spans multiple consoles.

```yaml
name: All-Time Classics
entries:
  gba:
    - Castlevania - Aria of Sorrow
    - Metroid Fusion
  snes:
    - Chrono Trigger
    - Super Metroid
  nds:
    - Castlevania - Dawn of Sorrow
```

When `platform` is omitted at the top level, `entries` must be a map of platform codes to title lists.

---

## Includes

Playlists can include other playlists. Entries are merged at sync time — the base playlist's entries come first, then the included playlist's entries.

```yaml
name: Extended GBA Library
platform: gba
entries:
  - Advance Wars
  - Fire Emblem
includes:
  - gba-favorites      # stems of other .yaml files (no extension)
  - gba-rpgs
```

Circular includes (`a` includes `b`, `b` includes `a`) are detected and reported as errors in the UI.

---

## How Title Matching Works

ROM Sync matches playlist entries against your library using two passes:

1. **Exact match** — the entry title (after normalization) matches a ROM title exactly.
2. **Fuzzy match** — fuse.js similarity search, gated by the threshold set in Settings (default 0.6 — lower is stricter).

**Normalization** strips region tags, revision markers, and version strings from filenames before matching:

| ROM filename | Normalized title |
|---|---|
| `Castlevania - Aria of Sorrow (USA).gba` | `castlevania - aria of sorrow` |
| `Final Fantasy VI (Rev 1).sfc` | `final fantasy vi` |
| `Pokemon - Emerald Version (USA, Europe).gba` | `pokemon - emerald version` |
| `Zelda no Densetsu - (Japan).gba` | `zelda no densetsu -` |

Subtitle parens are preserved: `Castlevania - Symphony of the Night (Disc 1)` stays intact.

**Tips for good matches:**
- Use the English title, not the Japanese title
- Drop region tags: `Super Mario World` not `Super Mario World (USA)`
- Punctuation matters: `Castlevania - Aria of Sorrow` not `Castlevania: Aria of Sorrow`
- The fuzzy matcher is tolerant of small differences, but platform isolation is strict — a GBA entry will never match an SNES ROM

---

## Platform Codes

Use lowercase. These map to subdirectory names in your ROM library and to paths on your SD card.

| Code | Console |
|---|---|
| `gba` | Game Boy Advance |
| `gbc` | Game Boy Color |
| `gb` | Game Boy |
| `snes` | Super Nintendo |
| `nes` | Nintendo Entertainment System |
| `n64` | Nintendo 64 |
| `nds` | Nintendo DS |
| `genesis` | Sega Genesis / Mega Drive |
| `psx` | PlayStation |
| `psp` | PlayStation Portable |
| `gg` | Game Gear |
| `msx` | MSX |

The platform code must match:
1. The subdirectory name in your ROM library (`/library/gba/`, `/library/snes/`, etc.)
2. A key in your device's `rom-sync.yaml` platform mappings

---

## Device Config (`rom-sync.yaml`)

To make an SD card a valid sync target, place a `rom-sync.yaml` file at the root of the card:

```yaml
device_name: My Anbernic Card
platforms:
  gba: /roms/gba
  snes: /roms/snes
  nds: /roms/nds
```

| Field | Required | Description |
|---|---|---|
| `device_name` | yes | Human-readable label shown in the Devices view |
| `platforms` | yes | Map of platform code → path on the card (relative to card root) |

---

## Full Example

```yaml
# ~/Library/Application Support/rom-sync/playlists/weekend-picks.yaml

name: Weekend Picks
platform: gba
entries:
  - Castlevania - Aria of Sorrow
  - Final Fantasy Tactics Advance
  - Pokemon Emerald
  - Mother 3
includes:
  - gba-favorites   # merges in entries from gba-favorites.yaml
```

```yaml
# ~/Library/Application Support/rom-sync/playlists/gba-favorites.yaml

name: GBA Favorites
platform: gba
entries:
  - Metroid Fusion
  - Advance Wars
  - Fire Emblem
```

Syncing `weekend-picks` will include 7 entries total (4 own + 3 from `gba-favorites`).
