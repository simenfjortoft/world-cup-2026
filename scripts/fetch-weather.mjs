#!/usr/bin/env node
/* =====================================================================
   fetch-weather.mjs , per-match kickoff weather into data/weather.json.

   Source: Open-Meteo (open-meteo.com) , free, no API key, CORS-friendly.
     - In range (kickoff within ~15 days): the hourly FORECAST at the
       stadium's coordinates, sampled at the venue-local kickoff hour.
     - Out of range: a seasonal "typical" from the ARCHIVE API , the same
       calendar date averaged over the last 6 years (flagged typical:true).

   The daily cron refines each forecast as the match approaches, so it is
   "final" on match day. Skips re-fetching if weather.json is < SKIP_FRESH_H
   hours old, so the 5-min match-day cron does not hammer the API.

   Run:   node scripts/fetch-weather.mjs            (writes data/weather.json)
   Test:  node scripts/fetch-weather.mjs --dry-run  (prints, writes nothing)
          node scripts/fetch-weather.mjs --force     (ignore the freshness skip)

   Output: data/weather.json
     { lastUpdated, source, matches: { "<i>": { c, feels, code, hi, lo, typical? } } }
     c/feels/hi/lo are °C; code is the WMO weather code (mapped to an icon client-side).
   ===================================================================== */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readMatches } from './codes.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const SKIP_FRESH_H = 2;                          // skip if weather.json is younger than this
const FORECAST_HORIZON_DAYS = 15;               // Open-Meteo forecast reaches ~16 days; stay just inside
const ARCHIVE_YEARS = [2019, 2020, 2021, 2022, 2023, 2024];

// stadium coordinates + IANA timezone, keyed by the schedule's hostCity
const VENUE_GEO = {
  "Mexico City":         { lat: 19.3029, lon: -99.1505,  tz: "America/Mexico_City" },
  "Guadalajara":         { lat: 20.6818, lon: -103.4628, tz: "America/Mexico_City" },
  "Monterrey":           { lat: 25.6692, lon: -100.2440, tz: "America/Monterrey" },
  "Toronto":             { lat: 43.6332, lon: -79.4185,  tz: "America/Toronto" },
  "Vancouver":           { lat: 49.2768, lon: -123.1120, tz: "America/Vancouver" },
  "Dallas":              { lat: 32.7473, lon: -97.0945,  tz: "America/Chicago" },
  "Atlanta":             { lat: 33.7554, lon: -84.4009,  tz: "America/New_York" },
  "Kansas City":         { lat: 39.0489, lon: -94.4839,  tz: "America/Chicago" },
  "Houston":             { lat: 29.6847, lon: -95.4107,  tz: "America/Chicago" },
  "SF Bay Area":         { lat: 37.4030, lon: -121.9700, tz: "America/Los_Angeles" },
  "Los Angeles":         { lat: 33.9535, lon: -118.3392, tz: "America/Los_Angeles" },
  "Philadelphia":        { lat: 39.9008, lon: -75.1675,  tz: "America/New_York" },
  "Seattle":             { lat: 47.5952, lon: -122.3316, tz: "America/Los_Angeles" },
  "Boston":              { lat: 42.0909, lon: -71.2643,  tz: "America/New_York" },
  "Miami":               { lat: 25.9580, lon: -80.2389,  tz: "America/New_York" },
  "New York/New Jersey": { lat: 40.8135, lon: -74.0745,  tz: "America/New_York" },
};

const round = x => x == null ? null : Math.round(x);
const pad = n => String(n).padStart(2, '0');

// kickoff (UTC ms) → { date:'YYYY-MM-DD', hour:HH } in the venue's local timezone
function venueLocal(utcMs, tz){
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit',
    day:'2-digit', hour:'2-digit', hour12:false }).formatToParts(new Date(utcMs));
  const g = t => p.find(x => x.type === t).value;
  let hh = g('hour'); if(hh === '24') hh = '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(hh) };
}

const daysUntil = dateStr => Math.round((Date.parse(dateStr + 'T12:00:00Z') - Date.now()) / 86400000);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tries = 3){
  for(let t = 1; ; t++){
    const res = await fetch(url);
    if(res.ok) return res.json();
    if((res.status === 429 || res.status >= 500) && t < tries){ await sleep(1500 * t); continue; }   // back off on rate-limit / transient
    throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`);
  }
}

// real forecast at the venue-local kickoff hour
async function forecast(geo, date, hour){
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}`
    + `&hourly=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min`
    + `&timezone=${encodeURIComponent(geo.tz)}&start_date=${date}&end_date=${date}&temperature_unit=celsius`;
  const j = await getJSON(u);
  const want = `${date}T${pad(hour)}:00`;
  let idx = j.hourly.time.indexOf(want);
  if(idx < 0) idx = Math.min(hour, j.hourly.time.length - 1);   // fall back to the index by hour
  return {
    c:     round(j.hourly.temperature_2m[idx]),
    feels: round(j.hourly.apparent_temperature[idx]),
    code:  j.hourly.weather_code[idx],
    hi:    round(j.daily.temperature_2m_max[0]),
    lo:    round(j.daily.temperature_2m_min[0]),
  };
}

// seasonal "typical": same calendar date averaged across ARCHIVE_YEARS (one call per venue, cached)
const archiveCache = new Map();
async function typical(geo, date){
  const mmdd = date.slice(5);                                   // 'MM-DD'
  const key = `${geo.lat},${geo.lon}`;
  if(!archiveCache.has(key)){
    const start = `${ARCHIVE_YEARS[0]}-06-01`, end = `${ARCHIVE_YEARS[ARCHIVE_YEARS.length-1]}-07-31`;
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lon}`
      + `&start_date=${start}&end_date=${end}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min`
      + `&timezone=${encodeURIComponent(geo.tz)}&temperature_unit=celsius`;
    archiveCache.set(key, await getJSON(u));
  }
  const a = archiveCache.get(key), mean=[], max=[], min=[];
  a.daily.time.forEach((t, i) => { if(t.slice(5) === mmdd){
    if(a.daily.temperature_2m_mean[i] != null) mean.push(a.daily.temperature_2m_mean[i]);
    if(a.daily.temperature_2m_max[i]  != null) max.push(a.daily.temperature_2m_max[i]);
    if(a.daily.temperature_2m_min[i]  != null) min.push(a.daily.temperature_2m_min[i]);
  }});
  if(!mean.length) return null;
  const avg = arr => arr.reduce((s,x)=>s+x,0)/arr.length;
  return { c: round(avg(mean)), hi: round(avg(max)), lo: round(avg(min)), typical: true };
}

const OUT = fileURLToPath(new URL('../data/weather.json', import.meta.url));

// freshness skip , don't re-hit the API on every short cron tick
if(!FORCE && !DRY && existsSync(OUT)){
  try{
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    const ageH = (Date.now() - Date.parse(prev.lastUpdated)) / 3600000;
    if(ageH < SKIP_FRESH_H){ console.log(`• weather.json is ${ageH.toFixed(1)}h old (< ${SKIP_FRESH_H}h) , skipping.`); process.exit(0); }
  }catch{ /* unreadable , refetch */ }
}

const M = readMatches();
const out = {};
const byVenueDate = new Map();                                  // dedupe API calls per (venue, local date)
let forecasts = 0, typicals = 0, skipped = 0, failed = 0;

for(const m of M){
  const geo = VENUE_GEO[m.hostCity];
  if(!geo){ skipped++; continue; }                             // unknown venue (e.g. TBC) , no weather
  const { date, hour } = venueLocal(m.utc, geo.tz);
  const cacheKey = `${m.hostCity}|${date}|${hour}`;
  if(byVenueDate.has(cacheKey)){ const w = byVenueDate.get(cacheKey); if(w) out[m.i] = w; continue; }

  const ahead = daysUntil(date);
  let w = null;
  try{
    if(ahead >= -2 && ahead <= FORECAST_HORIZON_DAYS){ w = await forecast(geo, date, hour); forecasts++; }
    else { w = await typical(geo, date); typicals++; }
  }catch(e){ failed++; console.error(`  ! ${m.hostCity} ${date}:`, e.message); }
  byVenueDate.set(cacheKey, w);
  if(w) out[m.i] = w;
  await sleep(120);                                            // be polite , spread requests under the rate limit
}

const payload = {
  lastUpdated: new Date().toISOString(),
  source: 'open-meteo.com',
  matches: out,
};

if(DRY) console.log(JSON.stringify(payload, null, 1));
else    writeFileSync(OUT, JSON.stringify(payload, null, 1));
console.log(`✓ ${DRY?'(dry-run) ':''}weather , ${forecasts} forecast + ${typicals} typical venue-dates`
  + `, ${Object.keys(out).length} matches${failed?`, ${failed} failed`:''}${skipped?`, ${skipped} no-venue`:''}`);
