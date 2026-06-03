#!/usr/bin/env node
/* =====================================================================
   fetch-squads.mjs , pull the 48 final 26-man squads for the 2026 World Cup
   from Wikipedia ("2026 FIFA World Cup squads") into data/squads.json.

   Source: Wikipedia via the MediaWiki API (no API key, complete data with
   shirt number / position / club). Re-run any time (e.g. injury replacements,
   allowed up to 24h before a team's first match):  node scripts/fetch-squads.mjs

   Output: data/squads.json
     { lastUpdated, source, teamCount, playerCount,
       teams: { CODE: { group, players: [{ name, position, club, number }] } } }
   ===================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Wikipedia heading name -> our 3-letter code (aliases included for naming variants)
const NAME2CODE = {
  "Mexico":"MEX","South Africa":"RSA","South Korea":"KOR","Korea Republic":"KOR",
  "Czech Republic":"CZE","Czechia":"CZE","Canada":"CAN","Bosnia and Herzegovina":"BIH",
  "Qatar":"QAT","Switzerland":"SUI","Brazil":"BRA","Morocco":"MAR","Haiti":"HAI","Scotland":"SCO",
  "United States":"USA","Paraguay":"PAR","Australia":"AUS","Turkey":"TUR","Türkiye":"TUR",
  "Germany":"GER","Curaçao":"CUR","Curacao":"CUR","Ivory Coast":"CIV","Côte d'Ivoire":"CIV","Cote d'Ivoire":"CIV","Ecuador":"ECU",
  "Netherlands":"NED","Japan":"JPN","Sweden":"SWE","Tunisia":"TUN",
  "Belgium":"BEL","Egypt":"EGY","Iran":"IRN","IR Iran":"IRN","New Zealand":"NZL",
  "Spain":"ESP","Cape Verde":"CPV","Cabo Verde":"CPV","Saudi Arabia":"KSA","Uruguay":"URU",
  "France":"FRA","Senegal":"SEN","Iraq":"IRQ","Norway":"NOR",
  "Argentina":"ARG","Algeria":"ALG","Austria":"AUT","Jordan":"JOR",
  "Portugal":"POR","DR Congo":"COD","Democratic Republic of the Congo":"COD","Congo DR":"COD",
  "Uzbekistan":"UZB","Colombia":"COL","England":"ENG","Croatia":"CRO","Ghana":"GHA","Panama":"PAN"
};
const GROUPS = { A:["MEX","RSA","KOR","CZE"],B:["CAN","BIH","QAT","SUI"],C:["BRA","MAR","HAI","SCO"],
  D:["USA","PAR","AUS","TUR"],E:["GER","CUR","CIV","ECU"],F:["NED","JPN","SWE","TUN"],
  G:["BEL","EGY","IRN","NZL"],H:["ESP","CPV","KSA","URU"],I:["FRA","SEN","IRQ","NOR"],
  J:["ARG","ALG","AUT","JOR"],K:["POR","COD","UZB","COL"],L:["ENG","CRO","GHA","PAN"] };
const groupOf = code => Object.keys(GROUPS).find(g=>GROUPS[g].includes(code)) || null;

// strip wiki markup from a value -> plain text
const clean = s => (s||'')
  .replace(/\{\{[^{}]*\}\}/g,'')                              // {{captain}}, {{birth date...}}
  .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g,'$2')              // [[Page|Display]] -> Display
  .replace(/<[^>]+>/g,'').replace(/'''?/g,'').replace(/&nbsp;/g,' ').trim();
const normPos = p => ({GK:'GK',DF:'DEF',MF:'MID',FW:'FWD'}[String(p||'').toUpperCase().trim()] || String(p||'').toUpperCase().trim());

// Corrections to Wikipedia's squad-list `pos` (Wikipedia errors). Key: "CODE|Exact Name".
// Survives re-fetches. Add entries here as miscategorisations are confirmed.
const POS_OVERRIDE = {
  "NOR|Julian Ryerson": "DEF",   // right-back; Wikipedia squad list wrongly tags him FW
};

// pull one |key=value out of a template body (value runs to the next top-level | )
function field(body, key){
  const m = new RegExp(`\\|\\s*${key}\\s*=`, 'i').exec(body);
  if(!m) return '';
  let i = m.index + m[0].length, depth = 0, out = '';
  for(; i<body.length; i++){
    const ch = body[i];
    if(ch==='{'||ch==='[') depth++;
    else if(ch==='}'||ch===']') depth--;
    else if(ch==='|' && depth<=0) break;
    out += ch;
  }
  return out.trim();
}

const API = 'https://en.wikipedia.org/w/api.php?action=parse&page=2026_FIFA_World_Cup_squads&prop=wikitext&format=json&formatversion=2';
const res = await fetch(API, { headers: { 'user-agent': 'wc2026-schedule/1.0 (personal project)' } });
if(!res.ok){ console.error('Wikipedia HTTP', res.status); process.exit(1); }
const wt = (await res.json()).parse.wikitext;

const teams = {}, unmapped = []; let playerCount = 0;
const heads = [...wt.matchAll(/^===\s*([^=].*?)\s*===\s*$/gm)];
for(let h=0; h<heads.length; h++){
  const name = clean(heads[h][1]);
  const code = NAME2CODE[name];
  const section = wt.slice(heads[h].index + heads[h][0].length, h+1<heads.length ? heads[h+1].index : wt.length);
  if(!code){ unmapped.push(name); continue; }
  const players = [];
  const re = /\{\{nat fs g player\b/gi; let pm;
  while((pm = re.exec(section))){
    let i = pm.index + 2, depth = 1, body = '';        // capture template body, brace-balanced
    for(; i<section.length && depth>0; i++){
      if(section[i]==='{' && section[i+1]==='{'){ depth++; body+='{{'; i++; }
      else if(section[i]==='}' && section[i+1]==='}'){ depth--; if(depth>0) body+='}}'; i++; }
      else body += section[i];
    }
    const no = parseInt(field(body,'no'), 10);
    const nm = clean(field(body,'name'));
    if(nm){
      const position = POS_OVERRIDE[`${code}|${nm}`] || normPos(field(body,'pos'));
      players.push({ name: nm, position, club: clean(field(body,'club')), number: Number.isFinite(no)?no:null });
    }
  }
  if(players.length){ teams[code] = { group: groupOf(code), players }; playerCount += players.length; }
}

const missing = Object.values(GROUPS).flat().filter(c => !teams[c]);
const out = {
  lastUpdated: new Date().toISOString().slice(0,10),
  source: 'Wikipedia , 2026 FIFA World Cup squads (en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads)',
  teamCount: Object.keys(teams).length,
  playerCount,
  teams
};
const outPath = fileURLToPath(new URL('../data/squads.json', import.meta.url));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1));

console.log(`✓ wrote data/squads.json , ${out.teamCount}/48 teams, ${out.playerCount} players, lastUpdated ${out.lastUpdated}`);
if(unmapped.length) console.log('  unmapped headings (add to NAME2CODE):', unmapped);
if(missing.length) console.log('  MISSING teams:', missing);
for(const [code,who] of [['FRA','Mbappé'],['FRA','Dembélé'],['ARG','Messi']]){
  const p = (teams[code]?.players||[]).find(x => x.name.includes(who));
  console.log(`  spot-check ${code}/${who}:`, p ? `#${p.number} ${p.name} , ${p.position}, ${p.club}` : 'NOT FOUND');
}
