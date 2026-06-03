/* =====================================================================
   codes.mjs , shared helpers for the data-update scripts (results,
   availability). Keeps team-name → 3-letter-code mapping and the MATCHES
   reader in one place so fetch-results / fetch-availability stay small.
   fetch-squads.mjs predates this and keeps its own copy (left untouched).
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GROUPS = {
  A:["MEX","RSA","KOR","CZE"], B:["CAN","BIH","QAT","SUI"], C:["BRA","MAR","HAI","SCO"],
  D:["USA","PAR","AUS","TUR"], E:["GER","CUR","CIV","ECU"], F:["NED","JPN","SWE","TUN"],
  G:["BEL","EGY","IRN","NZL"], H:["ESP","CPV","KSA","URU"], I:["FRA","SEN","IRQ","NOR"],
  J:["ARG","ALG","AUT","JOR"], K:["POR","COD","UZB","COL"], L:["ENG","CRO","GHA","PAN"]
};

// canonical name + every alias any feed (Wikipedia / API-Football) is likely to use
const ALIASES = {
  MEX:["Mexico"], RSA:["South Africa"], KOR:["South Korea","Korea Republic"], CZE:["Czechia","Czech Republic"],
  CAN:["Canada"], BIH:["Bosnia and Herzegovina","Bosnia & Herzegovina"], QAT:["Qatar"], SUI:["Switzerland"],
  BRA:["Brazil"], MAR:["Morocco"], HAI:["Haiti"], SCO:["Scotland"],
  USA:["United States","USA","United States of America"], PAR:["Paraguay"], AUS:["Australia"], TUR:["Turkey","Türkiye","Turkiye"],
  GER:["Germany"], CUR:["Curacao","Curaçao"], CIV:["Ivory Coast","Côte d'Ivoire","Cote d'Ivoire"], ECU:["Ecuador"],
  NED:["Netherlands","Holland"], JPN:["Japan"], SWE:["Sweden"], TUN:["Tunisia"],
  BEL:["Belgium"], EGY:["Egypt"], IRN:["Iran","IR Iran"], NZL:["New Zealand"],
  ESP:["Spain"], CPV:["Cape Verde","Cabo Verde"], KSA:["Saudi Arabia"], URU:["Uruguay"],
  FRA:["France"], SEN:["Senegal"], IRQ:["Iraq"], NOR:["Norway"],
  ARG:["Argentina"], ALG:["Algeria"], AUT:["Austria"], JOR:["Jordan"],
  POR:["Portugal"], COD:["DR Congo","Congo DR","DR-Congo","Democratic Republic of the Congo"], UZB:["Uzbekistan"], COL:["Colombia"],
  ENG:["England"], CRO:["Croatia"], GHA:["Ghana"], PAN:["Panama"]
};

// accent / punctuation / case insensitive key so feed spelling variants still resolve
const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
const NORM2CODE = {};
for(const [code,names] of Object.entries(ALIASES)) for(const n of names) NORM2CODE[norm(n)] = code;

/** team name (any feed spelling) → 3-letter code, or null if unknown */
export const teamCode = name => NORM2CODE[norm(name)] || null;

/** normalize a player name for fuzzy squad matching */
export const normName = norm;

/* MATCHES is the single source of truth and lives inline in index.html.
   Read + eval the array literal so the scripts never duplicate the schedule. */
export function readMatches(){
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const m = /const MATCHES\s*=\s*(\[[\s\S]*?\n\]);/.exec(html);
  if(!m) throw new Error('Could not locate the MATCHES array in index.html');
  // eslint-disable-next-line no-eval , trusted local source file
  const arr = eval(m[1]);                                   // object literals only, no helper calls
  return arr.map((match, i) => ({ ...match, i, utc: kickoffUTC(match) }));
}

/** replicate index.html kickoff(): kickoffLocal is Norwegian (CEST = UTC+2) */
export function kickoffUTC(m){
  const [y,mo,da] = m.date.split('-').map(Number);
  const [hh,mm]   = m.kickoffLocal.split(':').map(Number);
  return Date.UTC(y, mo-1, da + (m.plus?1:0), hh-2, mm);
}
