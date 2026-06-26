#!/usr/bin/env node
/* =====================================================================
   fetch-match-scorers.mjs , per-match goalscorers (name + minute) for the
   2026 World Cup from Wikipedia into data/match-scorers.json. The free
   football-data.org tier has NO goal events, so the match modal uses this
   to show who scored IN a given match (oriented to our home/away).

   Source: Wikipedia "Football box" templates on the group + knockout pages,
   via the MediaWiki API (no key). Team codes are explicit in the wikitext
   ({{#invoke:flag|fb-rt|ECU}}), so mapping is by 3-letter code, not name.

   Run:   node scripts/fetch-match-scorers.mjs
   Test:  node scripts/fetch-match-scorers.mjs --mock <wikitext.txt>  (one page)
   Output: data/match-scorers.json
     { lastUpdated, source, matches: { "<i>": { h:[{n,m,pen?,og?}], a:[...] } } }
   ===================================================================== */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readMatches } from './codes.mjs';

const args = process.argv.slice(2);
const MOCK = (i=>i>=0?args[i+1]:null)(args.indexOf('--mock'));
const UA = { 'user-agent': 'wc2026-schedule/1.0 (personal project)' };

const PAGES = [
  ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g=>`2026_FIFA_World_Cup_Group_${g}`),
  '2026_FIFA_World_Cup_knockout_stage',
];

// strip wiki markup -> plain text
const clean = s => (s||'')
  .replace(/\{\{[^{}]*\}\}/g,'')
  .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g,'$2')
  .replace(/<[^>]+>/g,'').replace(/'''?/g,'').replace(/&nbsp;/g,' ').trim();

// pull one |key=value out of a template body (value runs to the next top-level | , brace/bracket aware)
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

// Wikipedia uses some flag codes that differ from ours (FIFA/IOC variants)
const WIKI2OURS = { CUW:'CUR' };
const ourCode = c => c ? (WIKI2OURS[c] || c) : c;

// every {{#invoke:football box|main ...}} body on a page (brace-balanced)
function footballBoxes(wt){
  const out=[]; const re=/\{\{\s*#invoke:\s*football box/gi; let m;
  while((m=re.exec(wt))){
    let i=m.index+2, depth=1, body='';
    for(; i<wt.length && depth>0; i++){
      if(wt[i]==='{'&&wt[i+1]==='{'){ depth++; body+='{{'; i++; }
      else if(wt[i]==='}'&&wt[i+1]==='}'){ depth--; if(depth>0) body+='}}'; i++; }
      else body+=wt[i];
    }
    out.push(body);
  }
  return out;
}

const code3 = v => (String(v).match(/\b([A-Z]{3})\b/)||[])[1] || null;   // 3-letter flag code in a team1/team2 value

// parse a |goals1=/|goals2= block of "*[[Link|Display]] 9'" lines into [{n,m,pen?,og?}]
function parseGoals(block){
  const out=[];
  for(const raw of (block||'').split('\n')){
    const line=raw.trim(); if(!line.startsWith('*')) continue;
    const nm=(line.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/)||[])[1];
    const name=clean(nm || line.replace(/^\*+/,'').replace(/[\d(].*$/,''));
    if(!name) continue;
    const pen=/\bpen\.?\b|\{\{pen/i.test(line);
    const og=/\bo\.?g\.?\b|own[\s-]?goal/i.test(line);
    const mins=[...line.matchAll(/(\d+)(?:\+\d+)?\s*'/g)].map(x=>+x[1]);
    const base = { n:name, ...(pen?{pen:1}:{}), ...(og?{og:1}:{}) };
    if(mins.length) mins.forEach(m=>out.push({ ...base, m }));
    else out.push(base);
  }
  return out;
}

async function pageWikitext(page){
  if(MOCK) return readFileSync(MOCK,'utf8');
  const url=`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;
  const r=await fetch(url,{headers:UA});
  if(!r.ok){ console.error('Wikipedia HTTP',r.status,page); return null; }
  return (await r.json()).parse?.wikitext || null;
}

// ---- build lookup of where each team pair plays ----
const M = readMatches();
const groupPair = new Map();   // "AAA-BBB" -> group match
M.filter(m=>m.stage==='GROUP').forEach(m=> groupPair.set([m.home,m.away].sort().join('-'), m));
// knockout pairs are only known once results.json resolves the slot teams
const koPair = new Map();
try{
  const res = JSON.parse(readFileSync(fileURLToPath(new URL('../data/results.json',import.meta.url)),'utf8')).matches||{};
  M.filter(m=>m.stage!=='GROUP').forEach(m=>{ const a=res[m.i]||{}; if(a.h && a.a) koPair.set([a.h,a.a].sort().join('-'), {m, h:a.h, a:a.a}); });
}catch(e){ /* no results yet */ }

const pages = MOCK ? [PAGES[4]] : PAGES;
const out = {}; let boxes=0, mapped=0; const unmapped=[];
for(let pi=0; pi<pages.length; pi++){
  if(pi && !MOCK) await new Promise(r=>setTimeout(r, 1500));   // be gentle on the Wikipedia API (avoid 429)
  const wt = await pageWikitext(pages[pi]);
  if(!wt) continue;
  for(const box of footballBoxes(wt)){
    boxes++;
    const c1=ourCode(code3(field(box,'team1'))), c2=ourCode(code3(field(box,'team2')));
    if(!c1||!c2) continue;
    const g1=parseGoals(field(box,'goals1')), g2=parseGoals(field(box,'goals2'));
    if(!g1.length && !g2.length) continue;                       // 0-0 or no scorer detail
    const key=[c1,c2].sort().join('-');
    const gm=groupPair.get(key), ko=koPair.get(key);
    const tgt = gm || (ko && ko.m);
    if(!tgt){ unmapped.push(`${c1} v ${c2} (${page})`); continue; }
    const ourHome = gm ? gm.home : ko.h;                         // orient box team1/team2 to OUR home/away
    out[tgt.i] = ourHome===c1 ? { h:g1, a:g2 } : { h:g2, a:g1 };
    mapped++;
  }
}

const payload = { lastUpdated: new Date().toISOString().slice(0,10), source: 'Wikipedia , 2026 FIFA World Cup match reports', matches: out };
if(args.includes('--dry-run')) console.log(JSON.stringify(payload,null,1));
else writeFileSync(fileURLToPath(new URL('../data/match-scorers.json',import.meta.url)), JSON.stringify(payload,null,1));
console.log(`✓ ${args.includes('--dry-run')?'(dry-run) ':''}match-scorers , ${mapped} of ${boxes} football boxes mapped, ${Object.keys(out).length} matches`);
if(unmapped.length) console.log('  unmapped:', unmapped.slice(0,10), unmapped.length>10?`(+${unmapped.length-10})`:'');
