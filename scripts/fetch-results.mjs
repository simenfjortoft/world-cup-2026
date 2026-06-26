#!/usr/bin/env node
/* =====================================================================
   fetch-results.mjs , pull 2026 World Cup results from football-data.org
   into data/results.json. The app overlays this onto MATCHES at runtime
   (scores + resolved knockout teams) , see loadResults() in index.html.

   Source: football-data.org v4, competition WC (FIFA World Cup). The free
           tier covers the World Cup (API-Football's free tier does not).
   Auth:   set FOOTBALL_DATA_TOKEN (free key at football-data.org/client/register).
   Run:    FOOTBALL_DATA_TOKEN=... node scripts/fetch-results.mjs
   Test:   node scripts/fetch-results.mjs --mock <matches.json> --dry-run

   Mapping: group fixtures by team pair (unique); knockout fixtures by
   nearest kick-off instant (knockouts never overlap in time).
   Output: data/results.json
     { lastUpdated, source, matches: { "<i>": { h?, a?, hs?, as?, status? } } }
   ===================================================================== */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { teamCode, readMatches, GROUPS } from './codes.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i+1] ?? true) : undefined; };
const MOCK = opt('--mock');
const DRY  = args.includes('--dry-run');
const COMP = process.env.WC_COMPETITION || 'WC';     // football-data.org competition code

// football-data.org status -> our display status (only when meaningful)
const mapStatus = s =>
  s === 'FINISHED' ? 'FT' :
  s === 'PAUSED'   ? 'HT' :
  s === 'IN_PLAY'  ? 'LIVE' : null;

/* Current score for a fixture. fullTime is only reliably populated once the
   match is FINISHED , during IN_PLAY/PAUSED the running score lives in
   regularTime (or halfTime before the break), so fall through in that order.
   Returns [home, away] or null when no source has both values (not started). */
function liveScore(fx){
  for(const k of ['fullTime', 'regularTime', 'halfTime']){
    const s = fx.score?.[k];
    if(s && s.home != null && s.away != null) return [s.home, s.away];
  }
  return null;
}

// team object -> our 3-letter code (by name/shortName, then its 3-letter abbreviation)
const codeOf = t => !t ? null :
  (teamCode(t.name) || teamCode(t.shortName) || (t.tla && t.tla.length === 3 ? t.tla : null));

async function getMatches(){
  if(MOCK){
    const j = JSON.parse(readFileSync(MOCK, 'utf8'));
    return Array.isArray(j) ? j : (j.matches || []);
  }
  if(!process.env.FOOTBALL_DATA_TOKEN){
    console.log('• FOOTBALL_DATA_TOKEN not set , skipping results update (nothing written).');
    return null;                                     // graceful no-op before the secret is configured
  }
  const url = `https://api.football-data.org/v4/competitions/${COMP}/matches`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN } });
  if(!res.ok){
    const body = await res.text().catch(() => '');
    console.error('football-data.org HTTP', res.status, body.slice(0,200));
    process.exit(1);
  }
  return (await res.json()).matches || [];
}

const fixtures = await getMatches();
if(fixtures === null) process.exit(0);

// status histogram , distinguishes "upstream is stale" (all TIMED hours after kickoff)
// from "our mapping broke" (FINISHED fixtures present but 0 mapped) when reading run logs
const hist = {};
fixtures.forEach(fx => { hist[fx.status] = (hist[fx.status]||0) + 1; });
console.log('• upstream statuses:', Object.entries(hist).map(([k,v])=>`${k}:${v}`).join(' ') || '(none)');

// TEMP PROBE , does this tier expose per-match goal scorers? (remove after reading run logs)
if(!MOCK){
  const fin = fixtures.find(f => f.status === 'FINISHED');
  if(fin){
    console.log('PROBE list keys:', Object.keys(fin).join(','));
    console.log('PROBE list goals:', Array.isArray(fin.goals) ? `array(${fin.goals.length})` : typeof fin.goals);
    try{
      const r = await fetch(`https://api.football-data.org/v4/matches/${fin.id}`, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN } });
      const d = await r.json();
      console.log('PROBE detail http', r.status, '| goals:', Array.isArray(d.goals) ? `array(${d.goals.length}) sample=${JSON.stringify(d.goals[0]||null)}` : (typeof d.goals), '| keys:', Object.keys(d).join(','), d.message?`| message=${d.message}`:'');
    }catch(e){ console.log('PROBE detail error', e.message); }
  } else { console.log('PROBE no FINISHED fixture to inspect'); }
}

const M = readMatches();
const groupByPair = new Map();
M.filter(m => m.stage === 'GROUP').forEach(m => groupByPair.set([m.home, m.away].sort().join('-'), m));
const knockouts = M.filter(m => m.stage !== 'GROUP');

const out = {}, unmapped = [], usedKO = new Set();
let mapped = 0;

for(const fx of fixtures){
  const isGroup = fx.stage === 'GROUP_STAGE';
  const hCode = codeOf(fx.homeTeam), aCode = codeOf(fx.awayTeam);
  const status = mapStatus(fx.status);
  const sc = liveScore(fx);                          // fullTime → regularTime → halfTime fallback (in-play scores)
  const [gh, ga] = sc || [null, null];
  const hasScore = sc != null;

  if(isGroup){
    if(!hCode || !aCode){ unmapped.push(`group ${fx.homeTeam?.name} v ${fx.awayTeam?.name} (unknown code)`); continue; }
    const tgt = groupByPair.get([hCode, aCode].sort().join('-'));
    if(!tgt){ unmapped.push(`group ${hCode} v ${aCode} (no fixture in schedule)`); continue; }
    if(!hasScore){                                   // not played yet , but a FINISHED match with no score is the free tier's score delay: say so in the log
      if(status) unmapped.push(`group ${hCode} v ${aCode} (${fx.status} but score withheld , free-tier delay)`);
      continue;
    }
    const apiHomeIsOurs = tgt.home === hCode;        // orient goals to OUR home/away
    out[tgt.i] = { hs: apiHomeIsOurs ? gh : ga, as: apiHomeIsOurs ? ga : gh, status: status || 'FT' };
    mapped++;
  } else {
    const fxUtc = Date.parse(fx.utcDate);
    if(!Number.isFinite(fxUtc)){ unmapped.push(`knockout ${fx.stage} (bad date)`); continue; }
    let best = null, bd = Infinity;                  // nearest unused knockout slot by kick-off instant
    for(const k of knockouts){
      if(usedKO.has(k.i)) continue;
      const d = Math.abs(k.utc - fxUtc);
      if(d < bd){ bd = d; best = k; }
    }
    if(!best || bd > 24*3600*1000){ unmapped.push(`knockout ${fx.stage} @ ${fx.utcDate} (no slot within 24h)`); continue; }
    const entry = {};
    if(hCode) entry.h = hCode;                        // resolve the slot to its decided teams
    if(aCode) entry.a = aCode;
    if(hasScore){ entry.hs = gh; entry.as = ga; entry.status = status || 'FT'; }
    if(!Object.keys(entry).length) continue;          // teams still TBD and not played
    usedKO.add(best.i);
    out[best.i] = entry;
    mapped++;
  }
}

/* Resolve completed-group R32 slots from the FRESH standings, before the merge
   below, so a corrected group score re-resolves the slot rather than being pinned
   to a stale value the merge would otherwise re-inject. */
const decided = fillDecidedSlots(out, M);

/* Monotonic persistence: the free tier FLAPS , the opener went 1-0 LIVE →
   FINISHED-with-no-score → back to TIMED within an hour. A naive overwrite
   regresses scores we already had to nothing. Merge instead: an entry the API
   no longer reports is KEPT from the previous file; fresh data for the same
   match always replaces it (so corrections and FT upgrades still win). */
const OUT = fileURLToPath(new URL('../data/results.json', import.meta.url));
let kept = 0;
try{
  const prev = JSON.parse(readFileSync(OUT, 'utf8')).matches || {};
  for(const [i, e] of Object.entries(prev)){
    if(!(i in out)){ out[i] = e; kept++; }
  }
}catch(e){ /* no previous file , nothing to keep */ }

/* Resolve Round-of-32 slots from COMPLETED group standings. The API only fills
   a knockout slot once it publishes the bracket (laggy , often a day late), but a
   group with all six matches played already has a final 1st/2nd we can place now.
   Tiebreak order = FIFA's first three (points, goal difference, goals scored); if
   two teams tie through goals scored we skip that slot (head-to-head needed). We
   never overwrite a slot the API already resolved. */
function fillDecidedSlots(out, M){
  const tally = {};                                   // group -> code -> {P,Pts,GF,GA}
  for(const m of M){
    if(m.stage !== 'GROUP') continue;
    const r = out[m.i]; if(!r || r.hs == null || r.as == null) continue;
    const g = tally[m.group] ??= {};
    const H = g[m.home] ??= {P:0,Pts:0,GF:0,GA:0};
    const A = g[m.away] ??= {P:0,Pts:0,GF:0,GA:0};
    H.P++; A.P++; H.GF += r.hs; H.GA += r.as; A.GF += r.as; A.GA += r.hs;
    if(r.hs > r.as) H.Pts += 3; else if(r.hs < r.as) A.Pts += 3; else { H.Pts++; A.Pts++; }
  }
  const rank = s => [s.Pts, s.GF - s.GA, s.GF];        // higher is better, lexicographically
  const cmp = (a,b) => b[0]-a[0] || b[1]-a[1] || b[2]-a[2];
  const tied = (a,b) => cmp(rank(a), rank(b)) === 0;
  const slot = {};                                     // "1A"/"2B"/... -> { i, k:'h'|'a' }
  for(const m of M){ if(m.stage !== 'R32') continue;
    slot[m.home] = { i:m.i, k:'h' }; slot[m.away] = { i:m.i, k:'a' };
  }
  let added = 0;
  const place = (code, team) => { const s = slot[code]; if(!s) return;
    const e = out[s.i] ??= {}; if(e[s.k]) return;      // keep any API-resolved team
    e[s.k] = team; added++;
  };
  for(const [g, codes] of Object.entries(GROUPS)){
    const rows = codes.map(c => ({ c, ...(tally[g]?.[c] || {P:0,Pts:0,GF:0,GA:0}) }));
    if(rows.some(r => r.P < 3)) continue;              // group not complete yet
    rows.sort((a,b) => cmp(rank(a), rank(b)));
    const firstClear = !tied(rows[0], rows[1]);          // 1st separated from 2nd
    const secondClear = firstClear && !tied(rows[1], rows[2]);   // ...and 2nd separated from 3rd
    if(firstClear) place('1'+g, rows[0].c);
    if(secondClear) place('2'+g, rows[1].c);             // skip 2nd while 1st/2nd order is itself a tie
  }
  return added;
}

const payload = {
  lastUpdated: new Date().toISOString().slice(0,10),
  source: `football-data.org , competition ${COMP}`,
  matches: out
};

if(DRY){
  console.log(JSON.stringify(payload, null, 1));
} else {
  writeFileSync(OUT, JSON.stringify(payload, null, 1));
}
console.log(`✓ ${DRY?'(dry-run) ':''}results , ${mapped} of ${fixtures.length} matches mapped, ${Object.keys(out).length} entries${kept?` (${kept} kept)`:''}${decided?`, ${decided} R32 slots from completed groups`:''}`);
if(unmapped.length) console.log('  unmapped:', unmapped.slice(0,12), unmapped.length>12?`(+${unmapped.length-12} more)`:'');
