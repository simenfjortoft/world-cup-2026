# Goal Scorers, Team Stats & Norwegian TV Channels — Design

Date: 2026-06-04
Status: Approved (pending spec review)
Repo: world-cup-2026 (single-file `index.html` + node fetch scripts + cron-committed `data/*.json`)

## Goal

Add three things to the World Cup 2026 site:

1. A tournament-wide **goal scorers leaderboard** plus derived team scoring/defensive stats, on a new top-level "Scorers" tab.
2. The same stats, scoped per team, on each **team overview page** (the team's standings line, clean sheets, and its own scorers).
3. The **Norwegian TV channel** (NRK / TV 2 family) showing each match, displayed wherever match time/venue already appears.

A "latest line-up per match" was requested but is **out of scope** (see Non-Goals): per-match lineups are paywalled on football-data.org's free tier. The existing Wikipedia squad list remains the roster shown on team pages, and is where lineup data would later slot in.

## Constraints discovered (why the scope is what it is)

football-data.org **free tier** (competition `WC` is free-tier covered):

- `/v4/competitions/WC/scorers` — **available**. Returns each scorer with aggregate tournament `goals`, plus the player's `name`, `nationality`, `position`, and their `team`. `assists`, `penalties`, minutes, and cards are paid-tier; `penalties` is sometimes present, often `null` — treat as best-effort.
- Match detail lineups, substitutions, bookings, **and goal events are paid-only** (deep-data add-on, ~€29/mo). Consequence: we only get each player's *total* goals, not goals-per-match. So **hat-trick / brace flags cannot be derived** and are not built.
- Clean sheets and team goal breakdown **are** derivable — they come from the final match scores the app already stores in `data/results.json`, not from the API's player data.

Norwegian TV rights: **NRK and TV 2 share all 104 matches**, free-to-air, allocation published before the tournament and fixed (does not change live). There is **no API**; a static per-match field is the correct fit.

## Non-Goals

- Per-match starting XI / lineups / substitutions (free-tier paywalled — deferred).
- Assists, cards, minutes, shots, possession (paid-tier).
- Hat-trick / brace detection (requires per-match goal events we don't have).
- Any change to the live-score polling/fetch path beyond reading one new data file.
- Automated TV-channel updates (static data; no scraping, no cron).

## Architecture

Follows the existing project split exactly:

- `data/results.json` = scores + knockout resolution (hot-polled, live).
- `data/squads.json` = rosters (Wikipedia, rarely changes).
- **`data/scorers.json` (new)** = per-player goals (football-data.org, changes on match days).
- Derived stats (team goals for/against, GD, goals-per-match, clean sheets) are **computed in the browser** from `MATCHES` + the results overlay, reusing `computeStandings` — never precomputed in a script, so they can never drift from the scores already shown.
- TV channel = a **static `tv` field on each match literal** in `index.html`'s `MATCHES`, like `hostCity`/venue today.

### Component 1 — `scripts/fetch-scorers.mjs` (new)

Mirrors `fetch-results.mjs` structure and conventions:

- Graceful no-op (`exit 0`, writes nothing) when `FOOTBALL_DATA_TOKEN` is unset — safe before the secret is configured, identical to results.
- Supports `--mock <file>` and `--dry-run` for headless testing.
- Reuses `teamCode()` from `scripts/codes.mjs` to map the API `team` (by `name`/`shortName`/`tla`) to our 3-letter code, same mapping path as results. Unmapped teams are logged, not fatal.
- Request: `GET https://api.football-data.org/v4/competitions/{WC_COMPETITION||'WC'}/scorers?limit=100`, header `X-Auth-Token`.
- Output `data/scorers.json`:
  ```json
  {
    "lastUpdated": "2026-06-15",
    "source": "football-data.org · competition WC",
    "scorers": [
      { "name": "Erling Haaland", "code": "NOR", "nat": "Norway", "pos": "Offence", "goals": 3, "penalties": 1 }
    ]
  }
  ```
  - `penalties` is `null` when the tier doesn't expose it.
  - Pre-tournament the `scorers` array is empty (like `results.json` today).
  - Scorers whose `team` can't be mapped to a code are skipped and logged (kept out of the file rather than written with a null code).

### Component 2 — `.github/workflows/update-data.yml` (edit)

- Add a "Fetch scorers" step immediately after "Fetch results", reusing `FOOTBALL_DATA_TOKEN` and the same cron triggers (scorers change on the same cadence as scores).
- Add `data/scorers.json` to the existing `git add` line. The unchanged write-only-if-changed commit logic means idle runs still make no commit and trigger no Pages rebuild.

### Component 3 — "Scorers" view (new top-level tab)

Wired through the existing view machinery: add `'scorers'` to `VIEW_NAMES`, a label to `VIEW_LABELS`, a nav tab, a `#view-scorers` container, and a `renderScorers()` called from `setActiveView`/`rerenderViews`.

Contents:

- **Scorer leaderboard**: rank, flag + player name, team, position, goals, and a small "pen" badge when `penalties` is present and > 0. Sorted by `goals` desc, then `name` asc. Reads `window.SCORERS`.
- **Team scoring panel** (derived in-browser from `MATCHES` via `computeStandings`): per-team goals for / against / GD, goals-per-match, and clean sheets, as a sortable table answering "who's scoring / who's defending".
- Team flags/names link to the team page using the existing `teamLink`/route pattern.
- Empty pre-tournament state: a placeholder in the established tone ("No goals yet — the leaderboard fills in once matches kick off"), matching the squad/results placeholders.

### Component 4 — team page enrichment in `renderTeam(code)` (edit)

Add, alongside the existing Fixtures + Squad columns (Squad unchanged):

- **Stats strip**: the team's standings line — P · W · D · L · GF · GA · GD · Pts — plus clean sheets, from `computeStandings`. Shows zeros pre-tournament.
- **This team's scorers**: `window.SCORERS.scorers` filtered to `code` — player, goals, pen badge — sorted by goals desc; "No goals yet" before the team has scored.

### Component 5 — Norwegian TV channel

- **Data**: add a `tv` field to each match literal in `MATCHES`. Values are channel strings: `"NRK1"`, `"NRK2"`, `"TV 2"`, `"TV 2 Sport"`. Matches with no confirmed channel yet use a `"NRK / TV 2 TBC"` fallback (rendered as a muted "TBC" state).
  - **Initial population (chosen scope)**: Norway's group matches, the opener, the final, and both semi-finals now (confirmed in the published guide); all other matches seeded as TBC, fillable later. Source: published NRK and TV 2 VM TV-guides.
- **Display**: a small broadcaster badge on the existing meta line (next to Norwegian kickoff time / venue) in:
  - schedule rows,
  - the match modal,
  - the team-page fixture list (`renderTeam`).
- TBC matches render the badge in a muted style rather than hiding it, so it's visibly "to be confirmed".
- No fetch script, no cron, no polling involvement — purely static schedule data + render.

### Component 6 — loading & polling

- `loadScorers()` mirrors `loadSquads()`: `fetch('data/scorers.json')` → `window.SCORERS` → re-render the Scorers view and the current team page if open. Missing/unfetched file → graceful placeholders, never throws.
- Hook into the existing results poll: when `loadResults()` detects a changed payload, it also refreshes scorers (one call in the existing changed-data branch), so the leaderboard stays near-live on match days and stops when the tournament freezes (`RESULTS_FROZEN_AFTER`). **No new timer.**

## Data flow

```
football-data.org /scorers ──(cron)──> data/scorers.json ──fetch──> window.SCORERS ─┐
football-data.org /matches ──(cron)──> data/results.json ──overlay─> MATCHES ───────┼─> renderScorers()  (leaderboard + derived team table)
Wikipedia squads          ──(manual)─> data/squads.json  ──fetch──> window.SQUADS   ┘   renderTeam()      (stats strip + team scorers + squad)
static MATCHES[].tv  ─────────────────────────────────────────────────────────────────> schedule rows / match modal / team fixtures (TV badge)
```

Derived stats are recomputed from the single source of truth (`MATCHES` + results overlay) on every render, identical to how standings already work.

## Error handling

- `fetch-scorers.mjs`: missing token → no-op exit 0; HTTP error → log status + body slice, `exit 1` (same as results); unmappable team → skip + log; empty feed → write empty `scorers` array.
- Runtime: any failure to load `scorers.json` → placeholders, never a thrown error. TV badge with no/TBC value → muted "TBC" state.

## Testing

- **Script**: run `fetch-scorers.mjs --mock <fixture.json> --dry-run`; assert (a) team-name→code mapping, (b) `penalties: null` passthrough, (c) unmapped-team skip, (d) empty-feed produces an empty array. Mirrors how results is testable.
- **Browser**: feed a small `SCORERS` fixture + a known scoreline through the render path; verify leaderboard sort order, pen badge presence/absence, team-filter routing, derived clean-sheet/GD math against the known scoreline, the TV badge (confirmed vs TBC), and every empty (pre-tournament) state.

## Open items / future

- If the deep-data add-on is later purchased: real per-match lineups slot into the team-page Squad area, and assists/cards enrich the leaderboard — the `scorers.json` shape already has room.
- TV channel TBC entries get filled in as NRK/TV 2 firm up the knockout allocation.
