#!/usr/bin/env node
/* =====================================================================
   fetch-availability.mjs , pull current injuries & suspensions from
   API-Football and stamp a `status` onto the matching squad players in
   data/squads.json. The team page renders these as INJ / SUSP / ? badges.

   Source: API-Football (api-sports.io) /injuries, league 1 = World Cup.
   Auth:   set APISPORTS_KEY (same key as fetch-results.mjs).
   Run:    APISPORTS_KEY=... node scripts/fetch-availability.mjs
   Test:   node scripts/fetch-availability.mjs --mock <injuries.json> --dry-run

   Each run clears previous statuses first, so recovered players go back to
   available. Status values: 'suspended' | 'injured' | 'doubtful'.
   ===================================================================== */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { teamCode, normName } from './codes.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i+1] ?? true) : undefined; };
const MOCK = opt('--mock');
const DRY  = args.includes('--dry-run');
const LEAGUE = process.env.WC_LEAGUE_ID || '1';
const SEASON = process.env.WC_SEASON || '2026';
const RANK = { suspended: 3, injured: 2, doubtful: 1 };   // precedence when a player has several rows

function classify(type, reason){
  if(/suspend/i.test(reason || '')) return 'suspended';
  if(/^questionable$/i.test(type || '')) return 'doubtful';
  return 'injured';
}

async function getInjuries(){
  if(MOCK){
    const j = JSON.parse(readFileSync(MOCK, 'utf8'));
    return Array.isArray(j) ? j : (j.response || []);
  }
  if(!process.env.APISPORTS_KEY){
    console.log('• APISPORTS_KEY not set , skipping availability update (nothing written).');
    return null;
  }
  const url = `https://v3.football.api-sports.io/injuries?league=${LEAGUE}&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': process.env.APISPORTS_KEY } });
  if(!res.ok){ console.error('API-Football HTTP', res.status); process.exit(1); }
  const j = await res.json();
  if(j.errors && Object.keys(j.errors).length){ console.error('API-Football error:', j.errors); process.exit(1); }
  return j.response || [];
}

const rows = await getInjuries();
if(rows === null) process.exit(0);

const squadsPath = fileURLToPath(new URL('../data/squads.json', import.meta.url));
const squads = JSON.parse(readFileSync(squadsPath, 'utf8'));

// reset previous statuses so recoveries clear
for(const t of Object.values(squads.teams || {})) for(const p of t.players) delete p.status;

// index squad players by team code -> normalized name (and last token) for fuzzy match
const findPlayer = (code, name) => {
  const team = squads.teams?.[code]; if(!team) return null;
  const n = normName(name);
  let p = team.players.find(x => normName(x.name) === n);
  if(p) return p;
  const last = name.trim().split(/\s+/).pop();             // surname fallback (e.g. "K. Mbappé")
  if(last && last.length > 2) p = team.players.find(x => normName(x.name).endsWith(normName(last)));
  return p || null;
};

let matched = 0; const unmatched = [];
for(const r of rows){
  const code = teamCode(r.team?.name);
  const pname = r.player?.name;
  if(!code || !pname){ continue; }
  const p = findPlayer(code, pname);
  if(!p){ unmatched.push(`${r.team?.name}: ${pname}`); continue; }
  const status = classify(r.player?.type, r.player?.reason);
  if(!p.status || RANK[status] > RANK[p.status]){ p.status = status; }
  matched++;
}

squads.availabilityUpdated = new Date().toISOString().slice(0,10);

if(DRY){
  const flagged = [];
  for(const [code,t] of Object.entries(squads.teams||{})) for(const p of t.players) if(p.status) flagged.push(`${code} ${p.name} , ${p.status}`);
  console.log('flagged players:\n ', flagged.join('\n  ') || '(none)');
} else {
  writeFileSync(squadsPath, JSON.stringify(squads, null, 1));
}
console.log(`✓ ${DRY?'(dry-run) ':''}availability , ${matched} of ${rows.length} rows matched to squad players`);
if(unmatched.length) console.log('  unmatched:', unmatched.slice(0,12), unmatched.length>12?`(+${unmatched.length-12} more)`:'');
