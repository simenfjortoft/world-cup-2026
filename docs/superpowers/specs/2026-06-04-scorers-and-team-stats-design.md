# Goal Scorers, Team Stats & Norwegian TV Channels — Design

Date: 2026-06-04
Status: Approved
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
- Derived stats (team goals for/against, GD, goals-per-match, clean sheets) are **computed in the browser** from `MATCHES` + the results overlay — never precomputed in a script, so they can never drift from the scores already shown.
  - **Important**: the existing `computeStandings()` (index.html:1389) is **group-stage only** — it iterates `playedGroupMatches()` and `blankRow` tracks only `P/W/D/L/GF/GA/GD/Pts`, with **no clean-sheet field and no knockout matches**. It is therefore NOT sufficient for the tournament-wide stats this feature needs. The design adds a **new helper `teamGoalStats(code)`** that scans every played match a team appears in (group *and* knockout, orienting goals to that team's home/away side) and returns `{ P, W, D, L, GF, GA, GD, cleanSheets }`. The Scorers team panel and the team-page stats strip both use this new helper. `computeStandings` is left untouched (it still drives group standings).
  - Leaderboard and team goal stats are **tournament-wide** (group + knockout), consistent with a "top scorers" board.
- TV channel = a **static `tv` field on each match literal** in `index.html`'s `MATCHES`, like `hostCity`/venue today.

### Component 1 — `scripts/fetch-scorers.mjs` (new)

Mirrors `fetch-results.mjs` structure and conventions:

- Graceful no-op (`exit 0`, writes nothing) when `FOOTBALL_DATA_TOKEN` is unset — safe before the secret is configured, identical to results.
- Supports `--mock <file>` and `--dry-run` for headless testing.
- Reuses `teamCode()` from `scripts/codes.mjs` to map the API `team` (by `name`/`shortName`/`tla`) to our 3-letter code, same mapping path as results. Unmapped teams are logged, not fatal.
- Request: `GET https://api.football-data.org/v4/competitions/{WC_COMPETITION||'WC'}/scorers?limit=100`, header `X-Auth-Token`.
- The API's `position` vocabulary is `Goalkeeper/Defence/Midfield/Offence`; normalize to the app's `GK/DEF/MID/FWD` (same labels `renderSquad` uses, index.html:1692) in the script so the leaderboard reads consistently next to squad pages.
- Output `data/scorers.json` (note: separator is a comma, matching the existing scripts' `source` convention and the repo's no-dashes house style — not a middle dot):
  ```json
  {
    "lastUpdated": "2026-06-15",
    "source": "football-data.org , competition WC",
    "scorers": [
      { "name": "Erling Haaland", "code": "NOR", "nat": "Norway", "pos": "FWD", "goals": 3, "penalties": 1 }
    ]
  }
  ```
  - `penalties` is `null` when the tier doesn't expose it.
  - Pre-tournament the `scorers` array is empty (like `results.json` today). This empty-array-on-empty-feed case is **distinct** from the missing-token no-op, which writes nothing at all.
  - Scorers whose `team` can't be mapped to a code are skipped and logged (kept out of the file rather than written with a null code).
- **Rate limit**: free tier is ~10 req/min. Adding one `/scorers` call alongside the existing `/matches` call means 2 calls per cron run, including the Jun/Jul `*/5` windows — comfortably within the limit.

### Component 2 — `.github/workflows/update-data.yml` (edit)

- Add a "Fetch scorers" step immediately after "Fetch results", reusing `FOOTBALL_DATA_TOKEN` and the same cron triggers (scorers change on the same cadence as scores).
- Add `data/scorers.json` to the existing `git add` line. The unchanged write-only-if-changed commit logic means idle runs still make no commit and trigger no Pages rebuild.

### Component 3 — "Scorers" view (new top-level tab)

Wired through the existing view machinery. The nav tabs are **hardcoded markup**, so adding a view touches **four sites** (all must be edited, or the tab silently fails):
1. the static nav button list (index.html:923-927) — add `<button data-view="scorers">`;
2. the tabpanel section (index.html:970-975) — add the `#view-scorers` container with matching `aria-controls`;
3. `VIEW_NAMES` (index.html:2034) — add `'scorers'` (also drives the `tabs` selector at 2033 and arrow-key nav at 2048-2055);
4. `VIEW_LABELS` (index.html:1776) — add the title-case label.
Then a `renderScorers()` is called from `setActiveView` and added to `rerenderViews()` (see Component 6).

Contents:

- **Scorer leaderboard**: rank, flag + player name, team, position, goals, and a small "pen" badge when `penalties` is present and > 0. Sorted by `goals` desc, then `name` asc. Reads `window.SCORERS`. The flag glyph comes from `TEAMS[code][1]` (as everywhere else in the app) using the scorer's `code` — `nat` (country name) is for tooltip/label text only, not rendered as a flag.
- **Team scoring panel** (derived in-browser via the new `teamGoalStats(code)` helper, group + knockout): per-team goals for / against / GD, goals-per-match, and clean sheets, as a sortable table answering "who's scoring / who's defending".
- Team flags/names link to the team page using the existing `teamLink(code)` (index.html:1646) — it emits `<a class="tlink" data-team>` which the global click delegator (index.html:1997-1998) routes to `#team/CODE`. No new routing code.
- Empty pre-tournament state: a placeholder in the established tone ("No goals yet — the leaderboard fills in once matches kick off"), matching the squad/results placeholders.

### Component 4 — team page enrichment in `renderTeam(code)` (edit)

Add, alongside the existing Fixtures + Squad columns (Squad unchanged):

- **Stats strip**: the team's tournament record — P · W · D · L · GF · GA · GD — plus clean sheets, from the new `teamGoalStats(code)` helper (group + knockout, so it stays correct once knockouts begin). Shows zeros pre-tournament. Note: this is an all-matches record, not a group-standings row; group position/points remain on the Groups view (`computeStandings`). If a points figure is wanted here it must be group-stage Pts explicitly labelled "Group" — otherwise omit Pts to avoid implying knockout matches award points.
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

- `loadScorers()` mirrors `loadSquads()` (index.html:1703): `fetch('data/scorers.json')` → `window.SCORERS` → re-render the Scorers view and the current team page if open. Missing/unfetched file → graceful placeholders, never throws.
- **`rerenderViews()` (index.html:2306) must gain a `renderScorers()` call** — it currently re-renders schedule/groups/calendar/bracket but has no scorers branch, so without this the leaderboard won't refresh.
- Hook into the existing results poll: `loadResults()`'s changed-data branch is `if(Object.keys(AUTO_RESULTS).length){ applyOverlays(); rerenderViews(); route(); }` (index.html:1754). Add a `loadScorers()` call here so scorers refresh whenever scores change. This branch is intentionally gated on non-empty results — scorers stay empty until the first result lands, which is correct (no goals exist before the first match). The leaderboard thus stays near-live on match days and stops when the tournament freezes (`RESULTS_FROZEN_AFTER`). **No new timer.**

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

- **Script**: run `fetch-scorers.mjs --mock <fixture.json> --dry-run`; assert (a) team-name→code mapping, (b) position normalization `Offence→FWD` etc., (c) `penalties: null` passthrough, (d) unmapped-team skip, (e) empty-feed produces an empty array (distinct from the missing-token no-op which writes nothing). Mirrors how results is testable.
- **Browser**:
  - `teamGoalStats(code)`: feed a known set of played group + knockout matches and assert GF/GA/GD, clean-sheet count, and home/away goal orientation are correct (this is the highest-risk new logic — test it directly).
  - Render path: feed a small `SCORERS` fixture; verify leaderboard sort order, flag from `TEAMS[code][1]`, pen badge presence/absence, team-filter routing, the TV badge (confirmed vs TBC), and every empty (pre-tournament) state.

## Open items / future

- If the deep-data add-on is later purchased: real per-match lineups slot into the team-page Squad area, and assists/cards enrich the leaderboard — the `scorers.json` shape already has room.
- TV channel TBC entries get filled in as NRK/TV 2 firm up the knockout allocation.
