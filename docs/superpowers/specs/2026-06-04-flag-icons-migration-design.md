# Flag-Icons Migration — Design

Date: 2026-06-04
Status: Approved
Repo: world-cup-2026 (single-file `index.html` + node fetch scripts)

## Goal

Replace the 48 hand-drawn stylized inline-SVG flags with accurate, web-native SVGs from the open `flag-icons` library (lipis), bundled as files in the repo. This raises flag quality to real-heraldry level (correct coats of arms, emblems, trigrams) that hand-drawing cannot reach.

## Background / why this change

The flags are currently hand-built inline SVGs (`FLAGS` object + `FL`/`HT`/`VT`/`st` helpers + `#s`/`#uj` defs, swapped into `TEAMS[code][1]` by the loop at index.html:~1137). Despite iterative fixes (Mexico eagle, Spain arms, Korea trigrams, etc.) the stylized approach has a quality ceiling. A Freepik EPS collection was considered and rejected: it requires attribution, forbids inclusion "in any online or offline archive or database" (incompatible with a public repo), is a single EPS artwork needing conversion + slicing, and has incomplete coverage of 2026 teams.

`flag-icons` was verified instead: accurate full heraldry (Spain 81KB with the real arms + Pillars of Hercules; Mexico 85KB with the eagle), complete coverage of all 48 teams including `gb-eng`/`gb-sct`/`cw`/`cv` (all fetched 200 OK), MIT-licensed code with public-domain flags (no attribution required), individual web-native SVGs.

## Constraints / non-goals

- Bundle the SVGs as files in the repo (a `flags/` folder); do NOT hotlink a CDN (avoids a third-party runtime dependency and works offline).
- Do NOT change any render site. Every site consumes `TEAMS[code][1]`; only what that string contains changes (inline `<svg>` → `<img>`).
- No data-model, routing, or feature changes.
- Keep the existing flag polish (rounded corners, inset 1px outline, drop shadow) — it already lives on the `.fl`/`.flagsvg` containers and applies to `<img>` unchanged.
- Not in scope: changing flag display sizes/placement, adding new flag uses, or 1x1 (square) variants.

## Architecture

`flag-icons` 4x3 SVGs are downloaded into `flags/`. The hand-drawn flag system is removed and replaced by a code→ISO map plus an `<img>`-builder:

- **Delete**: the `FLAGS` object, the `FL`/`HT`/`VT`/`st` helper consts, the `#s` and `#uj` `<defs>` (used only by the hand-drawn flags — verify no other `href='#s'`/`href='#uj'` consumers remain), the ENG/SCO inline-SVG values in `TEAMS`, and the `Object.keys(TEAMS).forEach(...FLAGS...)` override loop (index.html:~1137).
- **Add**: a `FLAG_ISO` map (code → flag-icons filename), and a loop:
  ```js
  const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;');   // alt names contain '&' (Bosnia & Herz.)
  Object.keys(TEAMS).forEach(c=>{
    const iso = FLAG_ISO[c];
    if(iso) TEAMS[c][1] = `<img class="flagsvg" src="flags/${iso}.svg" alt="${esc(TEAMS[c][0])}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'flag-fallback',textContent:'${c}'}))">`;
  });
  ```
  (Exact fallback mechanism is an implementation detail; intent: a missing file degrades to the 3-letter code, not a broken-image icon. `alt` is HTML-escaped because two names contain `&` / apostrophes.)

Because `TEAMS[code][1]` is still an HTML string starting with a `.flagsvg` element, all ~14 render sites (`sideHTML`, mate chips, scorers board/table, group standings, calendar entries, bracket, match modal, team hero, map popover, team filter) render correctly with no change.

### FLAG_ISO map (complete, all 48)

```
MEX:mx RSA:za KOR:kr CZE:cz  CAN:ca BIH:ba QAT:qa SUI:ch
BRA:br MAR:ma HAI:ht SCO:gb-sct  USA:us PAR:py AUS:au TUR:tr
GER:de CUR:cw CIV:ci ECU:ec  NED:nl JPN:jp SWE:se TUN:tn
BEL:be EGY:eg IRN:ir NZL:nz  ESP:es CPV:cv KSA:sa URU:uy
FRA:fr SEN:sn IRQ:iq NOR:no  ARG:ar ALG:dz AUT:at JOR:jo
POR:pt COD:cd UZB:uz COL:co  ENG:gb-eng CRO:hr GHA:gh PAN:pa
```

### Asset acquisition

Download each `flags/{iso}.svg` from the flag-icons `4x3` set (e.g. `https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/{iso}.svg`, verified working). Commit the 48 files (license permits). Run each through SVGO is OPTIONAL (the heraldry-heavy ones are large but load on demand + cache); only do it if it does not visibly degrade the arms.

## CSS (only styling change): 3:2 → 4:3

flag-icons SVGs are 4:3 (viewBox 640x480); the hand-drawn ones were ~3:2 (9x6, rendered at ~1.52:1). The `.flagsvg` rules size via `em` against the container `font-size`. Keep each rule's `width` and set `height = width × 0.75` (4:3) to avoid horizontal stretch. Concrete targets (current → new height; widths unchanged):

| selector | line | width | height now → new |
| --- | --- | --- | --- |
| `.flagsvg` (base) | 308 | 1.25em | .82 → .9375em |
| `.tf-opt .flagsvg` | 431 | 1.2em | .78 → .9em |
| `.cal-entry .ce-fl .flagsvg` | 487 | 1.1em | .72 → .825em |
| `.team-flag .flagsvg` | 514 | 1.3em | .85 → .975em |
| `.mm-team .flagsvg` | 599 | 1.25em | .82 → .9375em |
| `.map-pop-flag .flagsvg` | 813 | 1.3em | .85 → .975em |

The container `font-size` knobs (`.fl`, `.mc-fl`, `.team-flag`, `.gst-team .fl`, etc.) stay unchanged; `font-size`-only containers (`.bk-fl`, `.mc-fl`, `.sc-fl`, `.sc-team .fl`, `.gst-team .fl`) inherit the base rule and so get 4:3 automatically. The existing `border-radius`, inset `box-shadow` outline, and `drop-shadow` filters apply to `<img>` unchanged.

Note: a few contexts size flags by `font-size` on the container with no `.flagsvg` override (relying on the base rule); these inherit the 4:3 base automatically. Also add `object-fit:cover` (or rely on exact 4:3 box) as a safety so any residual ratio mismatch crops rather than distorts.

## Data flow

`FLAG_ISO[code]` → `<img src="flags/{iso}.svg">` string → `TEAMS[code][1]` → consumed unchanged by every render site → browser loads `flags/{iso}.svg` (lazy, cached). No runtime SVG generation.

## Error handling / risks

- **Missing file (404)**: `onerror` fallback to the 3-letter code text. Mitigated up front by verifying all 48 return 200 at download time.
- **Aspect distortion**: addressed by the 4:3 CSS pass + `object-fit` safety.
- **Map/standings contexts**: the map popover (`t.flag`) and group-standings (`.gst-team .fl`, an inline-block container without a `.flagsvg` override) must be visually confirmed — they previously wrapped an inline `<svg>`; an `<img>` may size slightly differently. Verify and adjust those two specifically.
- **File weight**: heraldry-heavy flags (es 81KB, mx 85KB) are large but load only when shown and cache. Total `flags/` likely ~400-600KB. Acceptable for GitHub Pages; SVGO optional.
- **Single-file departure**: intentional, approved — the app gains a `flags/` folder.

## Testing / verification

1. Confirm all 48 files exist in `flags/` and each returns 200 from the local server.
2. Inline `<script>` still parses (`node --check` on the extracted main script).
3. Gallery (browser-injected, not shipped): render all 48 at hero (~150px) and chip (~18-26px); confirm correct country, no distortion, outline/rounding intact.
4. Real contexts: schedule card, team hero (`#team/MEX`, `#team/ESP`), mate chips, scorers team table, **group standings**, calendar entry, **bracket**, match modal, **map popover**, team-filter dropdown — confirm flags render, size correctly (4:3, no stretch), and keep their shadow/rounding.
5. No console 404s for flag files; no broken-image icons.
6. Diff discipline: changes limited to `flags/*` (new), the `FLAGS`→`FLAG_ISO` swap, the `.flagsvg` CSS ratio updates, and a license credit. No render-site logic changes.
7. Verify visually BEFORE shipping (project lesson: inspect, don't eyeball after).

## Out of scope

Hotlinking a CDN; changing flag sizes/placement; the Freepik EPS path; square (1x1) flags; any feature/data change.
