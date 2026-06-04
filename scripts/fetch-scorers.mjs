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
