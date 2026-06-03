#!/usr/bin/env node
/* =====================================================================
   fetch-results.mjs , pull 2026 World Cup results from API-Football into
   data/results.json. The web app overlays this onto MATCHES at runtime
   (scores + resolved knockout teams) , see loadResults() in index.html.

   Source: API-Football (api-sports.io), league 1 = FIFA World Cup.
   Auth:   set APISPORTS_KEY (free account at https://www.api-football.com/).
   Run:    APISPORTS_KEY=... node scripts/fetch-results.mjs
   Test:   node scripts/fetch-results.mjs --mock <fixtures.json> --dry-run

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
const LEAGUE = process.env.WC_LEAGUE_ID || '1';     // API-Football: 1 = FIFA World Cup
const SEASON = process.env.WC_SEASON || '2026';

// API status short-code -> our display status (only set when meaningful)
const mapStatus = s =>
  ['FT','AET','PEN'].includes(s) ? 'FT' :
  s === 'HT' ? 'HT' :
  ['1H','2H','ET','BT','LIVE','P','INT'].includes(s) ? 'LIVE' : null;

async function getFixtures(){
  if(MOCK){
    const j = JSON.parse(readFileSync(MOCK, 'utf8'));
    return Array.isArray(j) ? j : (j.response || []);
  }
  if(!process.env.APISPORTS_KEY){
    console.log('• APISPORTS_KEY not set , skipping results update (nothing written).');
    return null;                                    // graceful no-op (e.g. before the secret is configured)
  }
  const url = `https://v3.football.api-sports.io/fixtures?league=${LEAGUE}&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': process.env.APISPORTS_KEY } });
  if(!res.ok){ console.error('API-Football HTTP', res.status); process.exit(1); }
  const j = await res.json();
  if(j.errors && Object.keys(j.errors).length){ console.error('API-Football error:', j.errors); process.exit(1); }
  return j.response || [];
}

const fixtures = await getFixtures();
if(fixtures === null) process.exit(0);

const M = readMatches();
const groupByPair = new Map();
M.filter(m => m.stage === 'GROUP').forEach(m => groupByPair.set([m.home, m.away].sort().join('-'), m));
const knockouts = M.filter(m => m.stage !== 'GROUP');

const out = {}, unmapped = [], usedKO = new Set();
let mapped = 0;

for(const fx of fixtures){
  const round = fx.league?.round || '';
  const hName = fx.teams?.home?.name, aName = fx.teams?.away?.name;
  const hCode = teamCode(hName), aCode = teamCode(aName);
  const status = mapStatus(fx.fixture?.status?.short);
  const gh = fx.goals?.home, ga = fx.goals?.away;
  const hasScore = gh != null && ga != null;

  if(/group/i.test(round)){
    if(!hCode || !aCode){ unmapped.push(`group ${hName} v ${aName} (unknown code)`); continue; }
    const tgt = groupByPair.get([hCode, aCode].sort().join('-'));
    if(!tgt){ unmapped.push(`group ${hCode} v ${aCode} (no fixture in schedule)`); continue; }
    if(!hasScore) continue;                         // not played yet , nothing to record
    const apiHomeIsOurs = tgt.home === hCode;       // orient API goals to OUR home/away
    out[tgt.i] = { hs: apiHomeIsOurs ? gh : ga, as: apiHomeIsOurs ? ga : gh, status: status || 'FT' };
    mapped++;
  } else {
    const fxUtc = Date.parse(fx.fixture?.date);
    if(!Number.isFinite(fxUtc)){ unmapped.push(`knockout ${round} (bad date)`); continue; }
    let best = null, bd = Infinity;                 // nearest unused knockout slot by kick-off instant
    for(const k of knockouts){
      if(usedKO.has(k.i)) continue;
      const d = Math.abs(k.utc - fxUtc);
      if(d < bd){ bd = d; best = k; }
    }
    if(!best || bd > 24*3600*1000){ unmapped.push(`knockout ${round} @ ${fx.fixture?.date} (no slot within 24h)`); continue; }
    const entry = {};
    if(hCode) entry.h = hCode;                       // resolve the slot to its decided teams
    if(aCode) entry.a = aCode;
    if(hasScore){ entry.hs = gh; entry.as = ga; entry.status = status || 'FT'; }
    if(!Object.keys(entry).length) continue;         // teams still TBD and not played , skip
    usedKO.add(best.i);
    out[best.i] = entry;
    mapped++;
  }
}

const payload = {
  lastUpdated: new Date().toISOString().slice(0,10),
  source: `API-Football (api-sports.io) , league ${LEAGUE}, season ${SEASON}`,
  matches: out
};

if(DRY){
  console.log(JSON.stringify(payload, null, 1));
} else {
  const outPath = fileURLToPath(new URL('../data/results.json', import.meta.url));
  writeFileSync(outPath, JSON.stringify(payload, null, 1));
}
console.log(`✓ ${DRY?'(dry-run) ':''}results , ${mapped} of ${fixtures.length} fixtures mapped, ${Object.keys(out).length} match entries`);
if(unmapped.length) console.log('  unmapped:', unmapped.slice(0,12), unmapped.length>12?`(+${unmapped.length-12} more)`:'');
