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
- **`VENUES`** , the 16 host stadiums: `{ city, country, commonName, fifaName, capacity, timezone }`. FIFA tournament names show by default; toggle to common names in the control bar. Host cities are validated against confirmed anchor fixtures on load (opener → Mexico City, Canada opener → Toronto, third place → Miami, final → MetLife, semis → Dallas + Atlanta); an unmappable venue renders a visible ⚠ rather than an invented stadium.

Squads live **outside** the HTML in `data/squads.json` so they can be refreshed independently.

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

## Structure

```
world-cup-2026/
  index.html              # the app (schedule, groups, calendar, team pages) + match/venue data
  data/
    squads.json           # 48 squads, refreshable, with lastUpdated
  scripts/
    fetch-squads.mjs      # Node loader → data/squads.json
  README.md
```

## Notes

- All kickoff times are Norwegian (CEST, UTC+2). Matches after midnight carry a `+1` tag and sit on their matchday's evening, as broadcasters list them.
- Knockout fixtures show their bracket slot (e.g. *Winner Group C*, *Best 3rd*, *Winner Match 73*) until the qualifying teams are decided.
- Data sources: fixtures/times cross-checked against Sky Sports / NBC / ESPN / Wikipedia; the December 2025 final draw; squads from Wikipedia.
