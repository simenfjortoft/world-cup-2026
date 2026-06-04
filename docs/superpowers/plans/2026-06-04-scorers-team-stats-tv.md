# Goal Scorers, Team Stats & Norwegian TV Channels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tournament-wide goal-scorers leaderboard + derived team scoring/defensive stats (new "Scorers" tab and per-team sections), and a static Norwegian TV-channel badge on every match.

**Architecture:** Follow the existing project split exactly — a new node fetch script writes `data/scorers.json` (per-player goals from football-data.org free tier), committed by the existing cron; `index.html` loads it at runtime like `squads.json`. All derived team stats are computed in-browser from `MATCHES` + the results overlay via a new pure `teamGoalStats(code)` helper (group + knockout), never precomputed. TV channel is a static `tv` field on each match literal, rendered as a badge wherever venue/time already shows.

**Tech Stack:** Vanilla ES modules (node scripts), single-file `index.html` (no framework, no bundler), GitHub Actions cron, football-data.org v4 API. No test framework in the repo — scripts are verified with `--mock`/`--dry-run` (the existing `fetch-results.mjs` convention) and browser logic via the `window.WC_*` headless-exposure seam + the Claude Preview tools.

**Spec:** `docs/superpowers/specs/2026-06-04-scorers-and-team-stats-design.md`

---

## Conventions to honour (from the existing codebase)

- **No em/en dashes** anywhere in code, comments, or output (repo + user house style). Existing scripts use a comma as separator in `source` strings (e.g. `football-data.org , competition WC`). Match that.
- Graceful no-op when `FOOTBALL_DATA_TOKEN` is missing (exit 0, write nothing) — copy `fetch-results.mjs`.
- 3-letter team codes via `teamCode()` from `scripts/codes.mjs`.
- Runtime loaders never throw on a missing data file; they render placeholders (see `loadSquads`/`renderSquad`).
- Single source of truth: derived numbers come from `MATCHES` + overlay, recomputed each render.

## File Structure

- **Create** `scripts/fetch-scorers.mjs` — pull `/competitions/WC/scorers`, map team to code, normalize position, write `data/scorers.json`. Mirrors `fetch-results.mjs`.
- **Create** `data/scorers.json` — committed empty seed `{ "lastUpdated": "...", "source": "...", "scorers": [] }` so the runtime fetch never 404s pre-tournament (parallels the committed empty `results.json`).
- **Create** `test/fixtures/scorers-mock.json` — a small football-data.org-shaped fixture for `--mock` verification.
- **Modify** `.github/workflows/update-data.yml` — add a "Fetch scorers" step + `data/scorers.json` to `git add`.
- **Modify** `index.html` — `teamGoalStats` helper + `window.WC_STATS`; `loadScorers()` + `window.SCORERS`; new Scorers view (4 wiring sites + `renderScorers()` + CSS); `renderTeam` enrichment; `tv` field on `MATCHES` + TV badge in match card, modal, and team fixtures + CSS.

Tasks are ordered so each leaves the app working. Do them on a feature branch.

---

### Task 0: Branch

- [ ] **Step 1: Create a feature branch**

Run:
```bash
cd "/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026"
git checkout -b feat/scorers-team-stats-tv
```
Expected: `Switched to a new branch 'feat/scorers-team-stats-tv'`

---

### Task 1: Mock fixture + empty data seed

**Files:**
- Create: `test/fixtures/scorers-mock.json`
- Create: `data/scorers.json`

- [ ] **Step 1: Write the mock fixture** (football-data.org `/scorers` shape — enough to exercise mapping, normalization, penalties-null, and an unmappable team)

```json
{
  "count": 4,
  "competition": { "code": "WC", "name": "FIFA World Cup" },
  "scorers": [
    { "player": { "name": "Erling Haaland", "nationality": "Norway", "position": "Offence" },
      "team": { "name": "Norway", "tla": "NOR" }, "goals": 3, "penalties": 1 },
    { "player": { "name": "Kylian Mbappé", "nationality": "France", "position": "Offence" },
      "team": { "name": "France", "tla": "FRA" }, "goals": 2, "penalties": null },
    { "player": { "name": "Jude Bellingham", "nationality": "England", "position": "Midfield" },
      "team": { "name": "England", "tla": "ENG" }, "goals": 2, "penalties": null },
    { "player": { "name": "Nobody", "nationality": "Atlantis", "position": "Defence" },
      "team": { "name": "Atlantis", "tla": "ATL" }, "goals": 1, "penalties": null }
  ]
}
```

- [ ] **Step 2: Write the empty data seed** `data/scorers.json`

```json
{
 "lastUpdated": "2026-06-04",
 "source": "football-data.org , competition WC",
 "scorers": []
}
```

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/scorers-mock.json data/scorers.json
git commit -m "scorers: add mock fixture and empty data seed"
```

---

### Task 2: `scripts/fetch-scorers.mjs`

**Files:**
- Create: `scripts/fetch-scorers.mjs`
- Reference: `scripts/fetch-results.mjs` (pattern), `scripts/codes.mjs` (`teamCode`)

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/* =====================================================================
   fetch-scorers.mjs , pull 2026 World Cup top scorers from football-data.org
   into data/scorers.json. The app renders this as a leaderboard + per-team
   scorer lists , see loadScorers()/renderScorers() in index.html.

   Source: football-data.org v4, competition WC, /scorers (free-tier covered).
           Free tier gives each player's aggregate `goals`; `penalties` is
           sometimes present, often null. Assists/cards/minutes are paid-only
           and intentionally not requested.
   Auth:   set FOOTBALL_DATA_TOKEN (same key as fetch-results.mjs).
   Run:    FOOTBALL_DATA_TOKEN=... node scripts/fetch-scorers.mjs
   Test:   node scripts/fetch-scorers.mjs --mock test/fixtures/scorers-mock.json --dry-run
   Output: data/scorers.json
     { lastUpdated, source, scorers: [{ name, code, nat, pos, goals, penalties }] }
   ===================================================================== */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { teamCode } from './codes.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i+1] ?? true) : undefined; };
const MOCK = opt('--mock');
const DRY  = args.includes('--dry-run');
const COMP = process.env.WC_COMPETITION || 'WC';

// football-data.org position vocabulary -> our GK/DEF/MID/FWD (matches renderSquad labels)
const normPos = p => ({ Goalkeeper:'GK', Defence:'DEF', Midfield:'MID', Offence:'FWD' }[String(p||'').trim()] || null);
// team object -> our 3-letter code (name/shortName, then a 3-letter tla)
const codeOf = t => !t ? null :
  (teamCode(t.name) || teamCode(t.shortName) || (t.tla && t.tla.length === 3 && teamCode(t.tla)) || null);

async function getScorers(){
  if(MOCK){
    const j = JSON.parse(readFileSync(MOCK, 'utf8'));
    return j.scorers || [];
  }
  if(!process.env.FOOTBALL_DATA_TOKEN){
    console.log('• FOOTBALL_DATA_TOKEN not set , skipping scorers update (nothing written).');
    return null;
  }
  const url = `https://api.football-data.org/v4/competitions/${COMP}/scorers?limit=100`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN } });
  if(!res.ok){
    const body = await res.text().catch(() => '');
    console.error('football-data.org HTTP', res.status, body.slice(0,200));
    process.exit(1);
  }
  return (await res.json()).scorers || [];
}

const raw = await getScorers();
if(raw === null) process.exit(0);

const scorers = [], unmapped = [];
for(const s of raw){
  const code = codeOf(s.team);
  if(!code){ unmapped.push(s.team?.name || '(no team)'); continue; }
  scorers.push({
    name: s.player?.name || '(unknown)',
    code,
    nat: s.player?.nationality || null,
    pos: normPos(s.player?.position),
    goals: Number.isFinite(s.goals) ? s.goals : 0,
    penalties: Number.isFinite(s.penalties) ? s.penalties : null
  });
}
scorers.sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name));

const payload = {
  lastUpdated: new Date().toISOString().slice(0,10),
  source: `football-data.org , competition ${COMP}`,
  scorers
};

if(DRY){
  console.log(JSON.stringify(payload, null, 1));
} else {
  writeFileSync(fileURLToPath(new URL('../data/scorers.json', import.meta.url)), JSON.stringify(payload, null, 1));
}
console.log(`✓ ${DRY?'(dry-run) ':''}scorers , ${scorers.length} of ${raw.length} mapped`);
if(unmapped.length) console.log('  unmapped teams:', unmapped.slice(0,12), unmapped.length>12?`(+${unmapped.length-12} more)`:'');
```

- [ ] **Step 2: Run against the mock, dry-run**

Run:
```bash
node scripts/fetch-scorers.mjs --mock test/fixtures/scorers-mock.json --dry-run
```
Expected output includes:
- `✓ (dry-run) scorers , 3 of 4 mapped` (Atlantis is dropped)
- `unmapped teams: [ 'Atlantis' ]`
- JSON with Haaland first (`"pos": "FWD"`, `"penalties": 1`), Mbappé `"penalties": null`, Bellingham `"pos": "MID"`, sorted goals desc.

- [ ] **Step 3: Verify the missing-token no-op**

Run (no token in env):
```bash
env -u FOOTBALL_DATA_TOKEN node scripts/fetch-scorers.mjs --dry-run
```
Expected: `• FOOTBALL_DATA_TOKEN not set , skipping scorers update (nothing written).` and exit 0, no JSON.

- [ ] **Step 4: Verify empty-feed produces an empty array** (distinct from no-op)

Run:
```bash
node -e 'require("fs").writeFileSync("/tmp/empty.json", JSON.stringify({scorers:[]}))'
node scripts/fetch-scorers.mjs --mock /tmp/empty.json --dry-run
```
Expected: `✓ (dry-run) scorers , 0 of 0 mapped` and JSON with `"scorers": []`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-scorers.mjs
git commit -m "scorers: add fetch-scorers.mjs (football-data.org /scorers -> data/scorers.json)"
```

---

### Task 3: Wire the fetch into the cron workflow

**Files:**
- Modify: `.github/workflows/update-data.yml` (the "Fetch results" step block and the `git add` line, around lines 46-58)

- [ ] **Step 1: Add the scorers step after "Fetch results"**

After the existing `Fetch results` step, insert:
```yaml
      - name: Fetch scorers
        env:
          FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}
        run: node scripts/fetch-scorers.mjs
```

- [ ] **Step 2: Add the new file to the commit step**

Change the `git add` line to:
```bash
          git add data/results.json data/squads.json data/scorers.json
```

- [ ] **Step 3: Verify the YAML parses** (no formatter in repo; syntax-check)

Run:
```bash
node -e "const y=require('fs').readFileSync('.github/workflows/update-data.yml','utf8'); if(!/Fetch scorers/.test(y)||!/scorers\.json/.test(y)) throw new Error('missing'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "ci: fetch scorers alongside results on the data cron"
```

---

### Task 4: `teamGoalStats(code)` helper + headless exposure

**Files:**
- Modify: `index.html` — add the helper next to `computeStandings` (after ~line 1389), and add it to the `window.WC_STANDINGS` exposure block (line 1769) as `window.WC_STATS`.

Note: `computeStandings` is group-stage only and tracks no clean sheets, so this is a new, independent pure function over all of a team's played matches.

- [ ] **Step 1: Add the helper** (place right after `computeStandings`)

```js
// tournament-wide goals + clean sheets for one team, across group AND knockout
// matches it has played (a match counts once teams + score are resolved).
function teamGoalStats(code){
  const s = { P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, cleanSheets:0 };
  MATCHES.forEach(m=>{
    if(m.homeScore==null || m.awayScore==null) return;        // not played / not resolved
    const isHome = m.home===code, isAway = m.away===code;
    if(!isHome && !isAway) return;
    const gf = isHome ? m.homeScore : m.awayScore;            // orient to this team
    const ga = isHome ? m.awayScore : m.homeScore;
    s.P++; s.GF+=gf; s.GA+=ga;
    if(gf>ga) s.W++; else if(gf<ga) s.L++; else s.D++;
    if(ga===0) s.cleanSheets++;
  });
  s.GD = s.GF - s.GA;
  return s;
}
```

- [ ] **Step 2: Expose it for headless verification** (extend the existing `window.WC_STANDINGS` block ~line 1769)

Add this line right after that block:
```js
window.WC_STATS = { teamGoalStats };
```

- [ ] **Step 3: Verify with the preview tools**

Start the static server and inject a known scoreline through the existing `setAuto` seam, then assert. Use the Claude Preview tools:
- `preview_start` (serve the repo root; it is a static `index.html`).
- `preview_eval`:
```js
// MEX 3-0 RSA (match 0) -> MEX: P1 W1 GF3 GA0 CS1 ; RSA: P1 L1 GF0 GA3 CS0
window.WC_STANDINGS.setAuto({ "0": { hs:3, as:0, status:"FT" } });
JSON.stringify({ mex: window.WC_STATS.teamGoalStats("MEX"), rsa: window.WC_STATS.teamGoalStats("RSA") });
```
Expected: `mex` = `{P:1,W:1,D:0,L:0,GF:3,GA:0,GD:3,cleanSheets:1}`, `rsa` = `{P:1,W:0,D:0,L:1,GF:0,GA:3,GD:-3,cleanSheets:0}`.
Then reset: `preview_eval` → `window.WC_STANDINGS.setAuto({})`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "stats: add tournament-wide teamGoalStats helper (group + knockout, clean sheets)"
```

---

### Task 5: `loadScorers()` + `window.SCORERS` plumbing

**Files:**
- Modify: `index.html` — add `loadScorers()` near `loadSquads()` (~line 1703); call it in init (~line 2324) and in the `loadResults` changed-branch (line 1754).

- [ ] **Step 1: Add the loader** (mirror `loadSquads`)

```js
async function loadScorers(){
  try{
    const res=await fetch('data/scorers.json?t='+Date.now(), {cache:'no-store'}); if(!res.ok) throw new Error(res.status);
    window.SCORERS=await res.json();
    console.log('[scorers] loaded ·', window.SCORERS.lastUpdated, '·', (window.SCORERS.scorers||[]).length, 'scorers');
    // Guard on the element EXISTING and visible. A missing element makes `null?.hidden`
    // undefined and `!undefined` true, which would call the not-yet-defined renderScorers
    // in the intermediate (pre-Task-6) state. Require the node to exist first.
    const vs=$("#view-scorers"); if(vs && !vs.hidden) renderScorers();
    const vt=$("#view-team"); const m=/^#team\/([A-Z]{3})$/.exec(location.hash);
    if(vt && !vt.hidden && m && TEAMS[m[1]]) renderTeam(m[1]);
  }catch(e){ console.log('[scorers] data/scorers.json not available yet (run scripts/fetch-scorers.mjs)'); }
}
```

- [ ] **Step 2: Call it on init** — add `loadScorers();` right after `loadResults();` (~line 2325).

- [ ] **Step 3: Refresh it when scores change** — in `loadResults`, inside the `if(Object.keys(AUTO_RESULTS).length){ ... }` branch (line 1754), add `loadScorers();` after `route();`. (Scorers stay empty until the first result, which is correct.)

- [ ] **Step 4: Verify no console errors** via `preview_console_logs` after a reload. Expected: a single `[scorers] loaded` line from the empty seed and NO error. The fixed guard (`vs && !vs.hidden`) is false because `#view-scorers` does not exist yet (added in Task 6), so `renderScorers` is correctly not called and the catch block does not fire.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "scorers: load data/scorers.json at runtime and refresh on score changes"
```

---

### Task 6: The "Scorers" tab (4 wiring sites + renderScorers + CSS)

**Files:**
- Modify: `index.html` — nav button (after line 927), tabpanel (after line 974), `VIEW_NAMES` (line 2034), `VIEW_LABELS` (line 1776), `setActiveView` (line 2037-2038), `rerenderViews` (line 2306), plus `renderScorers()` and CSS.

- [ ] **Step 1: Add the nav tab button** (after the Bracket button, line 927)

```html
      <button role="tab" id="tab-scorers" aria-controls="view-scorers" aria-selected="false" tabindex="-1" data-view="scorers">Scorers</button>
```

- [ ] **Step 2: Add the tabpanel** (after the bracket section, line 974)

```html
    <section class="view" id="view-scorers" role="tabpanel" aria-labelledby="tab-scorers" tabindex="0" hidden></section>
```

- [ ] **Step 3: Register the view name + label**

- `VIEW_NAMES` (line 2034): `const VIEW_NAMES=['schedule','groups','calendar','map','bracket','scorers'];`
- `VIEW_LABELS` (line 1776): add `scorers:'Scorers'`.

- [ ] **Step 4: Build on first open + include in re-render**

- In `setActiveView` (after the `if(v==='bracket')...` line ~2038): add `if(v==='scorers') renderScorers();`
- In `rerenderViews` (line 2306): add `renderScorers();` to the call list.

- [ ] **Step 5: Write `renderScorers()`** (place near `renderBracket`, ~line 1599)

```js
function renderScorers(){
  const view=$("#view-scorers"); if(!view) return;
  const data=window.SCORERS, list=(data&&data.scorers)||[];
  const meta=data&&data.lastUpdated?`· updated ${data.lastUpdated}`:'';
  // Leaderboard
  let board;
  if(!list.length){
    board=`<p class="sq-note">No goals yet , the leaderboard fills in once matches kick off.</p>`;
  } else {
    board=`<ol class="sc-board">`+list.map((p,i)=>{
      const fl=TEAMS[p.code]?TEAMS[p.code][1]:'';
      const pen=(p.penalties&&p.penalties>0)?`<span class="sc-pen" title="${p.penalties} penalty goal${p.penalties>1?'s':''}">${p.penalties} pen</span>`:'';
      return `<li class="sc-row"><span class="sc-rank">${i+1}</span>
        <span class="sc-fl">${fl}</span>
        <a class="sc-nm tlink" data-team="${p.code}">${p.name}</a>
        <span class="sc-pos">${p.pos||''}</span>
        <span class="sc-goals">${p.goals}${pen}</span></li>`;
    }).join('')+`</ol>`;
  }
  // Team scoring/defense table (derived, all teams that have played)
  const codes=Object.keys(TEAMS).filter(c=>teamGoalStats(c).P>0)
    .map(c=>({c,...teamGoalStats(c)}))
    .sort((a,b)=>b.GF-a.GF || b.GD-a.GD || a.GA-b.GA);
  const teamTbl = codes.length ? `<table class="sc-teams"><thead><tr>
      <th>Team</th><th>P</th><th>GF</th><th>GA</th><th>GD</th><th>GF/m</th><th>CS</th></tr></thead><tbody>`+
      codes.map(t=>`<tr><td class="sc-team"><a class="tlink" data-team="${t.c}"><span class="fl">${TEAMS[t.c][1]}</span>${TEAMS[t.c][0]}</a></td>
        <td>${t.P}</td><td>${t.GF}</td><td>${t.GA}</td><td>${t.GD>0?'+':''}${t.GD}</td>
        <td>${(t.GF/t.P).toFixed(1)}</td><td>${t.cleanSheets}</td></tr>`).join('')+
      `</tbody></table>` : `<p class="sq-note">Team scoring stats appear once matches are played.</p>`;
  view.innerHTML=`
    <div class="sc-head"><h2 class="sc-title">Goal scorers</h2><span class="sc-meta">${meta}</span></div>
    <div class="sc-cols">
      <section class="sc-sec"><h3 class="team-h3">Leaderboard<span>by goals</span></h3>${board}</section>
      <section class="sc-sec"><h3 class="team-h3">Team scoring &amp; defense<span>this tournament</span></h3>${teamTbl}</section>
    </div>`;
}
```

- [ ] **Step 6: Add CSS** (near the other view styles; reuse existing tokens like `--text-faint`, `--accent`, card backgrounds — match `.sq-*`/`.team-*` look). Minimum:

```css
.sc-head{display:flex;align-items:baseline;gap:10px;margin:4px 0 14px}
.sc-title{margin:0;font-size:1.4rem}
.sc-meta{color:var(--text-faint);font-size:.85rem}
.sc-cols{display:grid;grid-template-columns:1fr 1fr;gap:22px}
@media(max-width:820px){ .sc-cols{grid-template-columns:1fr} }
.sc-board{list-style:none;margin:0;padding:0}
.sc-row{display:grid;grid-template-columns:1.6rem 1.6rem 1fr auto auto;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--hair,rgba(255,255,255,.07))}
.sc-rank{color:var(--text-faint);font-weight:700;text-align:right}
.sc-nm{font-weight:600;text-decoration:none;color:inherit}
.sc-nm:hover{text-decoration:underline}
.sc-pos{color:var(--text-faint);font-size:.75rem;font-weight:700}
.sc-goals{font-weight:800;font-variant-numeric:tabular-nums}
.sc-pen{margin-left:6px;font-size:.65rem;font-weight:700;color:var(--text-faint);border:1px solid currentColor;border-radius:4px;padding:1px 4px;vertical-align:middle}
.sc-teams{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.sc-teams th,.sc-teams td{padding:6px 8px;text-align:center;border-bottom:1px solid var(--hair,rgba(255,255,255,.07))}
.sc-teams th:first-child,.sc-teams td.sc-team{text-align:left}
.sc-team a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:inherit}
.sc-team .fl{font-size:1.1em}
```

- [ ] **Step 7: Verify in preview** — `preview_start` (or reload), click the Scorers tab (`preview_click` on `#tab-scorers`), `preview_snapshot`. Pre-tournament: expect "No goals yet" + the team-stats placeholder. Then inject a scoreline and a scorers fixture and re-check:
```js
window.SCORERS={lastUpdated:"2026-06-12",scorers:[
  {name:"Erling Haaland",code:"NOR",nat:"Norway",pos:"FWD",goals:3,penalties:1},
  {name:"Kylian Mbappé",code:"FRA",nat:"France",pos:"FWD",goals:2,penalties:null}]};
window.WC_STANDINGS.setAuto({"0":{hs:3,as:0,status:"FT"}});  // also gives a team row
renderScorers();
```
Expect: Haaland #1 with a "1 pen" badge, Mbappé #2, and a team row for MEX/RSA. Confirm clicking a player name routes to `#team/NOR` (`preview_click` then `preview_snapshot`). Reset `setAuto({})` after.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "scorers: add Scorers tab with leaderboard + derived team scoring table"
```

---

### Task 7: Team-page enrichment (stats strip + team scorers)

**Files:**
- Modify: `index.html` — `renderTeam` (lines 1671-1683) to add two blocks; reuse `teamGoalStats` and `window.SCORERS`.

- [ ] **Step 1: Build the two blocks inside `renderTeam`** (compute before the template, then inject into `.team-cols`)

Add before the `$("#view-team").innerHTML=...` assignment:
```js
const gs=teamGoalStats(code);
const statStrip=`<div class="team-stats">
  <div class="ts"><span>P</span><b>${gs.P}</b></div>
  <div class="ts"><span>W</span><b>${gs.W}</b></div>
  <div class="ts"><span>D</span><b>${gs.D}</b></div>
  <div class="ts"><span>L</span><b>${gs.L}</b></div>
  <div class="ts"><span>GF</span><b>${gs.GF}</b></div>
  <div class="ts"><span>GA</span><b>${gs.GA}</b></div>
  <div class="ts"><span>GD</span><b>${gs.GD>0?'+':''}${gs.GD}</b></div>
  <div class="ts"><span>Clean sheets</span><b>${gs.cleanSheets}</b></div>
</div>`;
const tsc=((window.SCORERS&&window.SCORERS.scorers)||[]).filter(p=>p.code===code).sort((a,b)=>b.goals-a.goals);
const scorersBlock = tsc.length
  ? `<div class="team-scorers">${tsc.map(p=>`<div class="tsc-row"><span class="tsc-nm">${p.name}</span><span class="tsc-g">${p.goals}${(p.penalties&&p.penalties>0)?` <span class="sc-pen">${p.penalties} pen</span>`:''}</span></div>`).join('')}</div>`
  : `<p class="sq-note">No goals yet for ${name}.</p>`;
```

- [ ] **Step 2: Insert the blocks into the markup** — add a new section as the first child of `.team-cols` (before the Fixtures section), so the team page reads stats → scorers → fixtures → squad:
```html
      <section class="team-stat-sec">
        <h3 class="team-h3">Tournament record<span>all matches played</span></h3>
        ${statStrip}
        <h3 class="team-h3" style="margin-top:16px">Scorers<span>this team</span></h3>
        ${scorersBlock}
      </section>
```

- [ ] **Step 3: Add CSS**

```css
.team-stats{display:flex;flex-wrap:wrap;gap:8px}
.team-stats .ts{display:flex;flex-direction:column;align-items:center;min-width:54px;padding:8px 10px;border:1px solid var(--hair,rgba(255,255,255,.08));border-radius:10px}
.team-stats .ts span{font-size:.66rem;letter-spacing:.04em;color:var(--text-faint);text-transform:uppercase}
.team-stats .ts b{font-size:1.1rem;font-variant-numeric:tabular-nums}
.team-scorers{display:flex;flex-direction:column;gap:2px}
.tsc-row{display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px solid var(--hair,rgba(255,255,255,.07))}
.tsc-g{font-weight:800;font-variant-numeric:tabular-nums}
```

- [ ] **Step 4: Verify in preview** — navigate to `#team/NOR` (`preview_eval`: `location.hash='#team/NOR'`), inject the scorers fixture + a NOR scoreline as in Task 6 Step 7, `preview_snapshot`. Expect the stats strip (zeros pre-data, correct numbers after inject) and a scorers row for Haaland. Confirm the Squad section below is unchanged.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "team page: add tournament record stats strip + this-team scorers"
```

---

### Task 8: Norwegian TV channel (static data + badge)

**Files:**
- Modify: `index.html` — add `tv` to the confirmed `MATCHES` literals (lines ~1130+), and render a badge in `matchCardHTML` (line 1335 area), `openMatch` modal (line 1947-1951), and `renderTeam` fixtures (line 1668).

Channel data is static (no API). Populate the **confirmed** set now from the published NRK / TV 2 VM guide; everything else renders as a muted "TBC".

Confirmed allocation to apply (source: NRK and TV 2 published VM TV-guides):
- Norway group matches: **NOR v IRQ → TV 2**, **NOR v SEN → NRK1**, **NOR v FRA → NRK1**.
- The Final → **NRK1**. Both Semi-finals → **TV 2**.
- (Re-verify against the live guide during execution; fill any additional confirmed group games. Leave unknown knockout slots without a `tv` field.)

- [ ] **Step 1: Add a `tv` field to the confirmed match literals**

Find Norway's three group matches in `MATCHES` (group I: NOR vs IRQ, SEN, FRA) and add `tv:"TV 2"` / `tv:"NRK1"` accordingly. On the FINAL match literal add `tv:"NRK1"`; on the two SF literals add `tv:"TV 2"`. Example shape:
```js
  {stage:"GROUP",group:"I",md:1,date:"...",kickoffLocal:"...",home:"NOR",away:"IRQ",hostCity:"...",tv:"TV 2"},
```

- [ ] **Step 2: Add a TV badge helper** (near `venueLineHTML`, ~line 1314)

```js
// Norwegian broadcaster badge (static schedule data). Muted "TBC" when unassigned.
function tvBadge(m){
  return m.tv
    ? `<span class="tv-badge" title="Norwegian broadcaster">📺 ${m.tv}</span>`
    : `<span class="tv-badge tbc" title="Norwegian broadcaster to be confirmed">📺 NRK / TV 2 TBC</span>`;
}
```

- [ ] **Step 3: Show it on the schedule match card** — in `matchCardHTML`, append `${tvBadge(m)}` inside the venue line. Simplest: change `${venueLineHTML(m)}` (line 1335) to `${venueLineHTML(m)}${tvBadge(m)}` (the badge sits under the venue line; style handles placement).

- [ ] **Step 4: Show it in the match modal** — in `openMatch`, add a meta row after the Stadium row (line 1950):
```html
      <div class="mm-row"><span>TV (Norway)</span><b>${m.tv||'NRK / TV 2 TBC'}</b></div>
```

- [ ] **Step 5: Show it in the team-page fixture list** — in `renderTeam`'s fixture map, append the badge to the `.tfx-meta` line (line 1668). Add `${tvBadge(m)}` at the end of that `<div class="tfx-meta">...</div>` content.

- [ ] **Step 6: Add CSS**

```css
.tv-badge{display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:700;color:var(--text-faint);margin-top:4px}
.tv-badge.tbc{opacity:.6;font-style:italic}
.mc .tv-badge{margin-top:2px}
```

- [ ] **Step 7: Verify in preview** — `preview_snapshot` of the schedule: a confirmed match (Norway's) shows e.g. "📺 TV 2"; an unassigned one shows the muted "📺 NRK / TV 2 TBC". Open that match (`preview_click`) and confirm the modal "TV (Norway)" row. Navigate to `#team/NOR` and confirm the badge on its fixtures.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "tv: static Norwegian broadcaster badge on cards, modal, and team fixtures"
```

---

### Task 9: Full integration check + finish

- [ ] **Step 1: Reload clean and sanity-check all surfaces** — `preview_start` fresh, `preview_console_logs` (expect `[scorers] loaded`, `[results] loaded`, `[squads] loaded`, no errors). Click through Scorers tab, a team page, and a match modal. `preview_resize` to mobile width and confirm `.sc-cols` collapses to one column and nothing overflows.

- [ ] **Step 2: Live fetch smoke test (optional, needs token)** — if a real `FOOTBALL_DATA_TOKEN` is available locally:
```bash
FOOTBALL_DATA_TOKEN=*** node scripts/fetch-scorers.mjs --dry-run
```
Expected: HTTP 200, a (likely empty pre-tournament) `scorers` array, exit 0. Do NOT commit the generated file from a real run unless intended.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/scorers-team-stats-tv
```

- [ ] **Step 4: Finish** — use superpowers:finishing-a-development-branch to merge or open a PR (the repo deploys via GitHub Pages on push to main, and the cron's next run will populate `scorers.json`).

---

## Out of scope (do not build — see spec Non-Goals)

Per-match starting lineups, substitutions, assists, cards, minutes (free-tier paywalled); hat-trick/brace flags (no per-match goal events on free tier); automated TV-channel updates (static data by design).
