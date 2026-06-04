# Flag Fidelity Audit & Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: this plan is visual-iterative (drawing SVG emblems and judging them in a browser); it is best executed **inline** by an agent with the Claude-in-Chrome / preview browser tools, not farmed to headless subagents.

**Goal:** Raise all 48 inline-SVG flags to a consistent fidelity bar so each reads as the correct country, fixing the flags whose identity currently reads wrong (Mexico ≈ bare tricolor, Ecuador ≈ Colombia) and the ones with wrong-shape emblems (Egypt/Iran stars).

**Architecture:** The only thing that changes is the SVG content of `FLAGS[code]` entries (index.html ~1087-1136) plus, if useful, one shared emblem helper/def. Every render site already consumes `TEAMS[code][1]` (which line ~1137 fills from `FLAGS`), so changing a flag's SVG propagates everywhere with zero render-code changes.

**Tech Stack:** Inline SVG (viewBox `0 0 9 6`), vanilla JS single-file app, no build, no test framework. "Tests" are visual: a throwaway browser-injected gallery rendering all 48 at chip (~18px) and hero (52px) sizes, screenshotted and judged against the spec's acceptance bar.

**Spec:** `docs/superpowers/specs/2026-06-04-flag-fidelity-audit-design.md`

---

## Conventions (from the spec — keep these in mind every task)

- Flags are inline SVG, `viewBox='0 0 9 6'` (width 9, height 6). White/empty bands are where emblems go.
- **Emblem-shape rule:** wrong-shape emblem (a star where there is no star) MUST be replaced; right-kind-but-crude MAY stay; missing-prominent emblem MUST be added.
- **Two-size goal:** at 52px the emblem must read as the *right kind* of mark; at 16px the bar is **differentiation only** (must not read as a different flag in the set) — emblem detail is not expected at 16px.
- Stylized, compact paths only — no traced heraldry, no external assets.
- No em/en dashes in code/comments (repo house style; existing flags use plain ASCII).
- Touch ONLY `FLAGS`/defs/helpers. No render-site, CSS, or data changes.

## File structure

- **Modify:** `index.html` — `FLAGS` object entries (and possibly the shared `<defs>` ~line 941-949 if an emblem is shared). Nothing else.

## The gallery harness (used as the "test" in every task)

Inject this in the browser console / preview eval (NEVER edit it into index.html). It renders all 48 flags at a chosen pixel width so you can screenshot and judge. Re-run after each FLAGS edit + page reload.

```js
// size = flag width in px; renders all 48 with code labels into a fixed overlay
(function(size){
  var old=document.getElementById('flag-audit'); if(old) old.remove();
  var codes=Object.keys(TEAMS);
  var box=document.createElement('div'); box.id='flag-audit';
  box.style.cssText='position:fixed;inset:0;z-index:99999;background:#0e1410;overflow:auto;padding:20px;display:grid;grid-template-columns:repeat(8,1fr);gap:14px;font-family:sans-serif';
  box.innerHTML=codes.map(function(c){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'
      +'<div class="fa-cell" style="width:'+size+'px;height:'+(size*2/3)+'px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #333;border-radius:3px">'+TEAMS[c][1]+'</div>'
      +'<div style="color:#cfcfcf;font-size:10px;font-weight:700">'+c+'</div></div>';
  }).join('');
  document.body.appendChild(box);
  box.querySelectorAll('.fa-cell .flagsvg').forEach(function(s){s.style.width=size+'px';s.style.height=(size*2/3)+'px';});
  return 'rendered '+codes.length+' at '+size+'px';
})(52);   // call again with (18) for the chip-size pass; remove with: document.getElementById('flag-audit').remove()
```

To re-test after editing a FLAGS string you can also live-patch a single flag without reloading: `TEAMS['MEX'][1] = "<svg ...>"; ` then re-run the gallery. But the **committed** source is the FLAGS entry, so always paste the final SVG into `FLAGS` in index.html and reload to confirm.

## Syntax check (run after each commit)

```bash
cd "/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026"
node -e 'const L=require("fs").readFileSync("index.html","utf8").split("\n");let s=-1;for(let i=0;i<L.length;i++)if(L[i].trim()==="<script>")s=i;let e=L.indexOf("</script>",s+1);require("fs").writeFileSync("/tmp/wc.js",L.slice(s+1,e).join("\n"))' && node --check /tmp/wc.js && echo "SYNTAX OK"
```

---

### Task 0: Branch + baseline capture

**Files:** none (setup)

- [ ] **Step 1: Branch**

```bash
cd "/Users/simenfjortoft/Library/CloudStorage/GoogleDrive-simen.fjortoft@unacast.com/My Drive/Claude/world-cup-2026"
git checkout -b feat/flag-fidelity
```
Expected: `Switched to a new branch 'feat/flag-fidelity'`

- [ ] **Step 2: Start the static server and capture the BEFORE state**

Start the preview server (node `.claude/static-server.mjs` on :8099, as used previously), open `http://localhost:8099/#schedule`, inject the gallery harness at `(52)` then `(18)`, and screenshot both. Keep these as the before-reference. Note which flags fail the bar (expected: MEX, ECU, EGY, IRN at minimum; eyeball HAI/KSA/IRQ/BRA/ESP/POR/CRO).

---

### Task 1: MEX — add a coat-of-arms emblem (must-fix)

**Acceptance:** MEX is no longer a bare tricolor; a dark emblem mark occupies ~the middle third of the white band; distinct from CIV and any other vertical tricolor at both sizes.

**Files:** Modify `index.html` — the `MEX:` entry (~line 1088), currently `MEX: VT('#006847','#fff','#ce1126'),`

- [ ] **Step 1: Replace with a tricolor + stylized eagle emblem** (candidate; refine in gallery)

```js
  MEX: FL(`<rect width='3' height='6' fill='#006847'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#ce1126'/>`
    +`<g transform='translate(4.5 3)'>`
      +`<path d='M-.55 .2 Q-.15 .05 0 -.25 Q.15 .05 .55 .2 Q.2 .25 .1 .55 Q0 .35 -.1 .55 Q-.2 .25 -.55 .2Z' fill='#5a3a1a'/>`   /* eagle body/wings */
      +`<path d='M0 -.25 Q.25 -.45 .5 -.35' fill='none' stroke='#5a3a1a' stroke-width='.12' stroke-linecap='round'/>`              /* head/beak */
      +`<path d='M-.55 .7 Q0 .95 .55 .7' fill='none' stroke='#2e6b34' stroke-width='.14'/>`                                        /* laurel */
    +`</g>`),
```

- [ ] **Step 2: Verify in the gallery**

Reload, inject gallery at 52px and 18px. Confirm: at 52px it reads as "Mexican flag with a central emblem"; at 18px it is clearly not a bare tricolor and not confusable with CIV. If the eagle is muddy or off-center, iterate the path (live-patch `TEAMS['MEX'][1]` for speed) until it passes, then ensure the final SVG is in `FLAGS`.

- [ ] **Step 3: Syntax check + commit**

```bash
# run the syntax-check block above
git add index.html
git commit -m "flags: give Mexico a stylized coat-of-arms emblem (was a bare tricolor)"
```

---

### Task 2: ECU — strengthen the arms so it differs from Colombia (must-fix)

**Acceptance:** ECU emblem disc ≥ ~0.8r with a contrasting outline/fill; unmistakable directly beside COL; COL unchanged.

**Files:** Modify `index.html` — the `ECU:` entry (~line 1107). Current trailing emblem: `<circle cx='4.5' cy='3' r='.55' fill='#7d6b3a'/>`.

- [ ] **Step 1: Replace the faint disc with a larger outlined arms mark** (candidate)

Keep the existing bands (yellow 0-3, blue 3-4.5, red 4.5-6); replace only the circle with:
```js
    +`<circle cx='4.5' cy='3' r='.95' fill='#f3d27a' stroke='#6b4f25' stroke-width='.13'/>`
    +`<path d='M3.75 2.95 Q4.5 2.45 5.25 2.95 Q4.5 2.75 3.75 2.95Z' fill='#34528f'/>`   /* condor wings hint */
    +`<path d='M4.05 3.25 H4.95 L4.5 3.65Z' fill='#2e6b34'/>`                            /* mountain hint */
```

- [ ] **Step 2: Verify ECU vs COL side by side**

Reload, gallery at 52px and 18px. Place focus on ECU and COL cells: at 18px ECU must show a visible central disc that COL lacks. Iterate disc size/contrast until unambiguous.

- [ ] **Step 3: Syntax check + commit**

```bash
git add index.html
git commit -m "flags: strengthen Ecuador's arms so it reads distinct from Colombia"
```

---

### Task 3: EGY + IRN — replace wrong-shape star emblems (wrong-shape bucket)

**Acceptance:** EGY shows an eagle-kind mark (not a star); IRN shows its emblem-kind mark (not a star). Right *kind* of mark at 52px; differentiation at 18px.

**Files:** Modify `index.html` — `EGY:` (~1113, currently `...${st(4.5,3,.5,'#c09300')}`) and `IRN:` (~1114, currently `...${st(4.5,3,.38,'#da0000')}`).

- [ ] **Step 1: EGY — swap the gold star for a gold eagle silhouette**

Replace the `${st(...)}` tail with a compact eagle (gold `#c09300`) centered on the white band (4.5,3):
```js
    +`<g transform='translate(4.5 3)' fill='#bf9b30'>`
      +`<path d='M-.6 -.05 Q-.2 -.15 0 -.4 Q.2 -.15 .6 -.05 Q.25 .05 .15 .45 Q0 .2 -.15 .45 Q-.25 .05 -.6 -.05Z'/>`  /* wings */
      +`<rect x='-.12' y='.3' width='.24' height='.45'/>`   /* tail */
    +`</g>`
```

- [ ] **Step 2: IRN — swap the red star for the emblem mark**

Replace the `${st(...)}` tail with a stylized red emblem (`#da0000`) centered (4.5,3) — a compact tulip/quad-curve mark, not a star:
```js
    +`<g transform='translate(4.5 3)' fill='#da0000'>`
      +`<path d='M0 -.35 Q.18 -.1 0 .25 Q-.18 -.1 0 -.35Z'/>`                 /* central stroke */
      +`<path d='M-.32 -.05 Q-.32 .2 -.12 .28 M.32 -.05 Q.32 .2 .12 .28' fill='none' stroke='#da0000' stroke-width='.13' stroke-linecap='round'/>`  /* side strokes */
    +`</g>`
```

- [ ] **Step 3: Verify both in the gallery (52px + 18px)**

Confirm neither reads as a star; both read as the right kind of mark at 52px and differentiate at 18px. Iterate paths as needed.

- [ ] **Step 4: Syntax check + commit**

```bash
git add index.html
git commit -m "flags: replace wrong-shape star emblems on Egypt and Iran with correct-kind marks"
```

---

### Task 4: Right-but-crude review pass (HAI, KSA, IRQ, BRA, ESP, POR, CRO)

**Acceptance:** each reads as the right *kind* of mark at 52px. Touch up ONLY those that fail; leave the rest. (Per spec: right-kind-but-crude may stay.)

**Files:** Modify `index.html` — only the entries that fail review.

- [ ] **Step 1: Review each at 52px in the gallery**

For each of HAI, KSA, IRQ, BRA, ESP, POR, CRO: does the emblem/field read as that country at 52px? Record pass/fail. Likely-fine (leave): KSA, IRQ, BRA, POR, CRO. Likely touch: HAI (white panel is an empty placeholder — add a small emblem hint), ESP (arms is a bare rect — make it read as a small shield).

- [ ] **Step 2: For each FAIL, apply a minimal stylized fix and re-verify**

HAI candidate (small arms hint in the white panel, centered ~4.5,3):
```js
    +`<rect x='3.5' y='2.1' width='2' height='1.8' fill='#fff'/>`
    +`<rect x='4.3' y='2.5' width='.4' height='1' fill='#0a7d2c'/><path d='M4.1 2.5H4.9L4.5 2.2Z' fill='#c8a44a'/>`  /* palm + hint */
```
ESP candidate (turn the bare rect into a small shield silhouette on the yellow band, ~3.0,3):
```js
    +`<path d='M2.55 2.45H3.25V3.1Q2.9 3.5 2.55 3.1Z' fill='#ad1519' stroke='#c8a44a' stroke-width='.06'/>`
```
Only commit changes for flags that actually failed.

- [ ] **Step 3: Syntax check + commit**

```bash
git add index.html
git commit -m "flags: touch up crude emblems that did not read at hero size (<list of flags changed>)"
```

---

### Task 5: Full 48 sign-off + ship

**Acceptance:** all 48 pass the bar; only FLAGS/defs changed; renders correctly in real contexts.

- [ ] **Step 1: Final gallery sign-off**

Reload, gallery at 52px then 18px. Walk all 48: (a) correct country at 52px, (b) at 18px none reads as a different flag in the set. Explicit pairs: ECU vs COL distinct; MEX not a bare tricolor and distinct from CIV. Screenshot both passes.

- [ ] **Step 2: Real-context spot checks**

Remove the gallery overlay. Verify flags in actual UI: a schedule card (`#schedule`), the team hero + mate chips (`#team/MEX`, `#team/ECU`), the scorers team table, and the team-filter dropdown. Confirm the edited flags look right in situ (not just the gallery).

- [ ] **Step 3: Diff discipline check**

```bash
git diff main --stat
git diff main -- index.html | grep -E '^\+' | grep -vE 'FLAGS|flagsvg|<rect|<path|<circle|<g |<use|</g>|defs|^\+\+\+' | head
```
Expected: the only changed lines are inside the `FLAGS` object / defs. No render-site, CSS, or gallery code in the diff.

- [ ] **Step 4: Syntax check + push**

```bash
# run the syntax-check block
git push -u origin feat/flag-fidelity
```

- [ ] **Step 5: Finish** — use superpowers:finishing-a-development-branch to merge to main (GitHub Pages redeploys on push).

---

## Out of scope (do not do)

External/bundled flag assets; any render-site/CSS/data change; redrawing flags that already pass the bar; committing the gallery overlay.
