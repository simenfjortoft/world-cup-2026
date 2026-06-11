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
import { teamCode, readMatches } from './codes.mjs';

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
    if(!hasScore) continue;                          // not played yet
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

const payload = {
  lastUpdated: new Date().toISOString().slice(0,10),
  source: `football-data.org , competition ${COMP}`,
  matches: out
};

if(DRY){
  console.log(JSON.stringify(payload, null, 1));
} else {
  writeFileSync(fileURLToPath(new URL('../data/results.json', import.meta.url)), JSON.stringify(payload, null, 1));
}
console.log(`✓ ${DRY?'(dry-run) ':''}results , ${mapped} of ${fixtures.length} matches mapped, ${Object.keys(out).length} entries`);
if(unmapped.length) console.log('  unmapped:', unmapped.slice(0,12), unmapped.length>12?`(+${unmapped.length-12} more)`:'');
