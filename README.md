# World Cup 2026 , Schedule, Calendar & Teams

An interactive board for the 2026 FIFA World Cup (USA · Canada · Mexico, 11 Jun - 19 Jul, 104 matches), built for **Norwegian time (CET/CEST)** with venue-local time alongside.

Single self-contained front end (`index.html`) that reads one match data source and a refreshable squad file. No build step, no framework.

## Views

- **Schedule** , every match by day, stage colour-coded, with stadium + Norwegian and venue-local kickoff.
- **Groups** , the 12 groups (A-L), each with its four teams and six fixtures.
- **Calendar** , month grid (June + July). Group-stage matches are coloured by group; knockout rounds use a distinct stage colour ramp. Each entry shows both time zones.
- **Team pages** , `#team/NOR` etc. Group, full fixture list (both time zones + stadium), and the 26-man squad. Reachable by clicking any team anywhere in the app.

## Data model

`index.html` holds two inline tables:

- **`MATCHES`** , the single source of truth. Every view derives from it. Each entry: `{ n, stage, group, md, date, kickoffLocal, plus, home, away, hostCity }`. Norwegian kickoff is the stored time; the absolute instant is built once (`kickoff()`), and venue-local time is that same instant formatted in the stadium's IANA timezone via `Intl`.
- **`VENUES`** , the 16 host stadiums: `{ city, country, commonName, fifaName, capacity, timezone }`. Common names (Azteca, MetLife…) show by default; toggle to FIFA tournament names in the control bar. Host cities are validated against confirmed anchor fixtures on load (opener → Mexico City, Canada opener → Toronto, third place → Miami, final → MetLife, semis → Dallas + Atlanta); an unmappable venue renders a visible ⚠ rather than an invented stadium.

Live data lives **outside** the HTML so it refreshes without editing the app: squads in `data/squads.json`, and match results + resolved knockout teams in `data/results.json`. The app overlays `results.json` onto `MATCHES` at load (scores, and once decided, the actual knockout teams) and reads an optional per-player `status` (injured / suspended / doubtful) from `squads.json`. See *Live data* below.

## Run it

`index.html` fetches `data/squads.json`, so it must be served (not opened from `file://`):

```bash
# any static server works, e.g.
npx serve .            # then open the printed http://localhost:… /index.html
# or
python3 -m http.server 8152
```

## Refresh the squads

FIFA allows injury replacements up to 24 hours before a team's first match, so re-run the loader whenever you want the latest:

```bash
node scripts/fetch-squads.mjs
```

It pulls all 48 final 26-man squads from Wikipedia ("2026 FIFA World Cup squads") via the MediaWiki API (no API key), parses name / position / club / shirt number, maps each country to its 3-letter code, and writes `data/squads.json` with a `lastUpdated` date (shown on every team page). Requires Node 18+ (uses built-in `fetch`); no dependencies.

## Live data , results, injuries & suspensions (automatic)

During the tournament the app updates itself. Three Node scripts (Node 18+, no dependencies) write the refreshable JSON, and a GitHub Action runs them on a schedule and commits any changes , Pages redeploys on push.

| Script | Source | Writes | Updates |
|---|---|---|---|
| `scripts/fetch-squads.mjs` | Wikipedia (no key) | `data/squads.json` | the 26-man squads |
| `scripts/fetch-results.mjs` | API-Football | `data/results.json` | scores + resolved knockout teams |
| `scripts/fetch-availability.mjs` | API-Football | player `status` in `data/squads.json` | injuries + suspensions |

**One-time setup** (for the API-Football scripts):

1. Create a free key at <https://www.api-football.com/>.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**: name `APISPORTS_KEY`, value your key.
3. Enable Actions if prompted. The workflow `.github/workflows/update-data.yml` then runs every 3 hours (and on demand via *Run workflow*). The scripts no-op safely if the key is missing, so nothing breaks before step 2.

**Run any of them manually:**

```bash
APISPORTS_KEY=… node scripts/fetch-results.mjs        # or fetch-availability.mjs
node scripts/fetch-squads.mjs                          # no key needed
# add --dry-run (with --mock <file>) to preview without writing
```

Mapping is by team pair for group games and by kickoff instant for knockouts; both fetchers log anything they can't map. `data/results.json` is keyed by match index (the `data-mi` on each fixture).

## Structure

```
world-cup-2026/
  index.html                  # the app + match/venue data; overlays results.json & squad status at runtime
  data/
    squads.json               # 48 squads (+ optional per-player injury/suspension status)
    results.json              # live scores + resolved knockout teams (overlaid onto MATCHES)
  scripts/
    codes.mjs                 # shared team-code map + MATCHES reader
    fetch-squads.mjs          # Wikipedia → data/squads.json (no key)
    fetch-results.mjs         # API-Football → data/results.json
    fetch-availability.mjs    # API-Football → injury/suspension status in squads.json
  .github/workflows/
    update-data.yml           # cron: run the fetchers + commit (Pages redeploys)
  README.md
```

## Notes

- All kickoff times are Norwegian (CEST, UTC+2). Matches after midnight carry a `+1` tag and sit on their matchday's evening, as broadcasters list them.
- Knockout fixtures show their bracket slot (e.g. *Winner Group C*, *Best 3rd*, *Winner Match 73*) until the qualifying teams are decided.
- Data sources: fixtures/times cross-checked against Sky Sports / NBC / ESPN / Wikipedia; the December 2025 final draw; squads from Wikipedia.
