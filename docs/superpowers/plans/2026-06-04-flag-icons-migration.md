# Flag-Icons Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this one — it needs browser visual verification) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Best executed **inline** by an agent with the Claude-in-Chrome / preview browser tools.

**Goal:** Replace the 48 hand-drawn inline-SVG flags with accurate `flag-icons` SVGs bundled in a `flags/` folder, referenced via `<img>`, with no render-site changes.

**Architecture:** Download the 48 flag-icons 4x3 SVGs into `flags/`. Delete the hand-drawn flag system (`FLAGS` object, `FL`/`HT`/`VT`/`st` helpers, `#s`/`#uj` defs, ENG/SCO inline SVGs, the override loop). Replace with a `FLAG_ISO` map + a loop that sets `TEAMS[code][1]` to an `<img class="flagsvg" src="flags/{iso}.svg">`. Update six `.flagsvg` CSS rules from ~3:2 to 4:3. Every render site is unchanged (all read `TEAMS[code][1]`).

**Tech Stack:** Bundled SVG assets, vanilla single-file app, no build, no test framework. "Tests" are: all-48-return-200 checks + a browser-injected gallery + real-context spot checks.

**Spec:** `docs/superpowers/specs/2026-06-04-flag-icons-migration-design.md`

---

## Conventions / guardrails

- Touch ONLY: new `flags/*`, the `FLAGS`→`FLAG_ISO` swap, the 6 `.flagsvg` CSS heights, the ENG/SCO `TEAMS` values, a license credit. No render-site logic.
- No em/en dashes in code/comments (repo house style).
- The map's `<defs id="mapOcean">` (index.html:2349) is UNRELATED to flags — do NOT touch it. Only remove the flag defs at 941-949.

## Repo paths

- Repo root: `/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026`
- Static server (for preview): `node .claude/static-server.mjs` on port 8099.

## Syntax check (run after each index.html edit)

```bash
cd "/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026"
node -e 'const L=require("fs").readFileSync("index.html","utf8").split("\n");let s=-1;for(let i=0;i<L.length;i++)if(L[i].trim()==="<script>")s=i;let e=L.indexOf("</script>",s+1);require("fs").writeFileSync("/tmp/wc.js",L.slice(s+1,e).join("\n"))' && node --check /tmp/wc.js && echo "SYNTAX OK"
```

---

### Task 0: Branch + download the 48 flags

**Files:** Create `flags/*.svg` (48), `flags/CREDITS.md`

- [ ] **Step 1: Branch**

```bash
cd "/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026"
git checkout -b feat/flag-icons
```

- [ ] **Step 2: Download all 48 flag-icons 4x3 SVGs**

```bash
mkdir -p flags
ISOS="mx za kr cz ca ba qa ch br ma ht gb-sct us py au tr de cw ci ec nl jp se tn be eg ir nz es cv sa uy fr sn iq no ar dz at jo pt cd uz co gb-eng hr gh pa"
fail=0
for iso in $ISOS; do
  code=$(curl -sL --max-time 20 "https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${iso}.svg" -o "flags/${iso}.svg" -w "%{http_code}")
  sz=$(wc -c < "flags/${iso}.svg")
  if [ "$code" != "200" ] || [ "$sz" -lt 50 ]; then echo "FAIL ${iso}: HTTP ${code}, ${sz} bytes"; fail=1; fi
done
echo "downloaded: $(ls flags/*.svg | wc -l) files; total $(du -sh flags | cut -f1)"
[ "$fail" = "0" ] && echo "ALL 48 OK" || echo "SOME FAILED"
```
Expected: `downloaded: 48 files`, `ALL 48 OK`. (If any fail, retry that ISO; do not proceed with a missing flag.)

- [ ] **Step 3: Validate each is a real SVG (not an error page)**

```bash
bad=0; for f in flags/*.svg; do head -c 200 "$f" | grep -qi "<svg" || { echo "NOT SVG: $f"; bad=1; }; done; [ "$bad" = 0 ] && echo "ALL VALID SVG"
```
Expected: `ALL VALID SVG`

- [ ] **Step 4: Add license credit**

Create `flags/CREDITS.md`:
```markdown
# Flag assets

Flags in this folder are from [flag-icons](https://github.com/lipis/flag-icons) by Panayiotis Lipiridis.

- Code license: MIT.
- The flag images themselves are in the public domain.

Files are the `4x3` set, named by ISO 3166-1 alpha-2 code (plus `gb-eng`, `gb-sct` for England and Scotland).
```

- [ ] **Step 5: Commit the assets**

```bash
git add flags/
git commit -m "flags: bundle the 48 flag-icons 4x3 SVGs + credit"
```

---

### Task 1: Swap the flag system to <img> (delete hand-drawn, add FLAG_ISO)

**Files:** Modify `index.html` — defs (941-949), helpers+FLAGS+loop (1083-1137), ENG/SCO `TEAMS` values (1070, 1079)

- [ ] **Step 1: Remove the flag `<defs>` block (lines 941-949)**

Delete this entire block (the hidden SVG holding the `#s` star and `#uj` union jack — used only by the hand-drawn flags):
```html
<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
  <path id="s" d="M0,-1 0.225,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.225,-0.309Z"/>
  <g id="uj">
    <path d="M0 0 9 6M9 0 0 6" fill="none" stroke="#fff" stroke-width="1.5"/>
    <path d="M0 0 9 6M9 0 0 6" fill="none" stroke="#cf142b" stroke-width=".6"/>
    <rect x="3.5" width="2" height="6" fill="#fff"/><rect y="2" width="9" height="2" fill="#fff"/>
    <rect x="3.9" width="1.2" height="6" fill="#cf142b"/><rect y="2.4" width="9" height="1.2" fill="#cf142b"/>
  </g>
</defs></svg>
```
(Leave the surrounding blank line. Do NOT touch the `mapOcean` defs at line ~2349.)

- [ ] **Step 2: Replace the helpers + FLAGS object + override loop (lines 1083-1137) with FLAG_ISO + the img-builder**

Replace the whole block from `const FL = i =>` (1083) through `Object.keys(TEAMS).forEach(c=>{ if(FLAGS[c]) TEAMS[c][1]=FLAGS[c]; });` (1137) with:
```js
/* Flags , bundled flag-icons SVGs (flags/<iso>.svg), referenced as <img>.
   Map each 3-letter team code to its flag-icons filename, then swap TEAMS[code][1]
   (consumed by every render site) to an <img>. See flags/CREDITS.md. */
const FLAG_ISO = {
  MEX:'mx', RSA:'za', KOR:'kr', CZE:'cz', CAN:'ca', BIH:'ba', QAT:'qa', SUI:'ch',
  BRA:'br', MAR:'ma', HAI:'ht', SCO:'gb-sct', USA:'us', PAR:'py', AUS:'au', TUR:'tr',
  GER:'de', CUR:'cw', CIV:'ci', ECU:'ec', NED:'nl', JPN:'jp', SWE:'se', TUN:'tn',
  BEL:'be', EGY:'eg', IRN:'ir', NZL:'nz', ESP:'es', CPV:'cv', KSA:'sa', URU:'uy',
  FRA:'fr', SEN:'sn', IRQ:'iq', NOR:'no', ARG:'ar', ALG:'dz', AUT:'at', JOR:'jo',
  POR:'pt', COD:'cd', UZB:'uz', COL:'co', ENG:'gb-eng', CRO:'hr', GHA:'gh', PAN:'pa'
};
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
Object.keys(TEAMS).forEach(c=>{
  const iso=FLAG_ISO[c];
  if(iso) TEAMS[c][1]=`<img class="flagsvg" src="flags/${iso}.svg" alt="${escHtml(TEAMS[c][0])}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'flag-fallback',textContent:'${c}'}))">`;
});
```

- [ ] **Step 3: Replace the ENG and SCO inline-SVG values in TEAMS with emoji (the loop overrides them anyway; this removes dead inline SVG)**

Line 1070 `SCO:["Scotland","<svg ...></svg>"]` → `SCO:["Scotland","🏴󠁧󠁢󠁳󠁣󠁴󠁿"]`
Line 1079 `ENG:["England","<svg ...></svg>"]` → `ENG:["England","🏴󠁧󠁢󠁥󠁮󠁧󠁿"]`
(Use exact-string Edit; match the full `<svg ...></svg>` value.)

- [ ] **Step 4: Syntax check**

Run the syntax-check block. Expected: `SYNTAX OK`.

- [ ] **Step 5: Confirm no orphaned references remain**

```bash
grep -nE "href='#s'|href='#uj'|\bFL\(|\bHT\(|\bVT\(|\bst\(|FLAGS\[" index.html | grep -v FLAG_ISO || echo "NONE (clean)"
```
Expected: `NONE (clean)` (no remaining uses of the deleted helpers/defs/FLAGS).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "flags: swap hand-drawn inline SVG for bundled flag-icons <img> (FLAG_ISO map)"
```

---

### Task 2: CSS 3:2 → 4:3 pass

**Files:** Modify `index.html` — six `.flagsvg` rules (308, 431, 487, 514, 599, 813)

- [ ] **Step 1: Update the base rule (line 308) — add object-fit safety + 4:3 height**

`.flagsvg{width:1.25em;height:.82em;border-radius:2px;...}` →
`.flagsvg{width:1.25em;height:.9375em;border-radius:2px;vertical-align:-.1em;display:inline-block;object-fit:cover;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}`
(Change height `.82em`→`.9375em`, add `object-fit:cover`.)

- [ ] **Step 2: Update the five context overrides (4:3 = height = width × .75)**

- 431 `.tf-opt .flagsvg{width:1.2em;height:.78em}` → `height:.9em`
- 487 `.cal-entry .ce-fl .flagsvg{width:1.1em;height:.72em}` → `height:.825em`
- 514 `.team-flag .flagsvg{width:1.3em;height:.85em}` → `height:.975em`
- 599 `.mm-team .flagsvg{width:1.25em;height:.82em}` → `height:.9375em`
- 813 `.map-pop-flag .flagsvg{width:1.3em;height:.85em}` → `height:.975em`

- [ ] **Step 3: Syntax check (CSS is inside the HTML; just confirm the script still parses)**

Run the syntax-check block. Expected: `SYNTAX OK`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "flags: set flag display boxes to 4:3 (flag-icons native ratio)"
```

---

### Task 3: Verify everywhere + ship

- [ ] **Step 1: Start server, confirm flags serve**

```bash
(pkill -f static-server.mjs 2>/dev/null; sleep 0.4; node .claude/static-server.mjs >/tmp/wc-server.log 2>&1 &) ; sleep 1.2
for iso in mx es kr gb-eng cw za sa pt; do curl -s -o /dev/null -w "$iso:%{http_code} " "http://localhost:8099/flags/$iso.svg"; done; echo
```
Expected: all `200`.

- [ ] **Step 2: Gallery check (browser-injected, NOT committed)**

Open `http://localhost:8099/#schedule`, inject a gallery that renders every `TEAMS[c][1]` at hero (~150px) and chip (~22px). Confirm: all 48 render (no broken-image icons), correct country, no horizontal distortion, rounded corners + subtle outline intact. Screenshot both sizes.

- [ ] **Step 3: Real-context spot checks**

Visit and eyeball each: schedule card (`#schedule`), team hero + mate chips (`#team/MEX`, `#team/ESP`, `#team/ENG`), scorers team table (`#scorers`), Groups standings (`#groups` — the `.gst-team` flag), Calendar (`#calendar`), Bracket (`#bracket`), a match modal (click a card), Map popover (`#map`, click a nation), team-filter dropdown (open "Filter teams"). Confirm flags load, size correctly (4:3, no stretch), keep shadow/rounding. Pay special attention to **group standings** and the **map popover** (spec-flagged).

- [ ] **Step 4: Console + network clean**

`preview_console_logs`/network (or Chrome read_console): no 404s for `flags/*`, no errors.

- [ ] **Step 5: Diff discipline**

```bash
git diff main --stat
```
Expected: `flags/*` added, `index.html` changed. No other files.

- [ ] **Step 6: Push + finish**

```bash
git push -u origin feat/flag-icons
```
Then use superpowers:finishing-a-development-branch to merge to main.

---

## Out of scope

Hotlinking a CDN; changing flag sizes/placement; the Freepik EPS; 1x1 square flags; any feature/data change; SVGO (optional, skip unless a flag is egregiously large and it does not degrade the arms).
