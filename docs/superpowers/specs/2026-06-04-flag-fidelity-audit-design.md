# Flag Fidelity Audit & Upgrade — Design

Date: 2026-06-04
Status: Approved (pending spec review)
Repo: world-cup-2026 (single-file `index.html`)

## Goal

Audit all 48 inline-SVG national flags and raise them to a consistent fidelity bar so each reads unmistakably as the correct country at the sizes the app actually renders, using the existing stylized inline-SVG approach. The trigger was Mexico rendering as a bare green-white-red tricolor (indistinguishable from Italy) in the team-page hero.

## Background / current state (important)

The emoji-to-SVG migration is **already complete**: every one of the 48 teams has an inline-SVG flag. `FLAGS[code]` (index.html:~1087) holds an SVG string built by small helpers, and line ~1137 swaps it into `TEAMS[code][1]`, overriding the emoji fallback. Two flags (ENG, SCO) are inline SVG directly in `TEAMS`. So there is **no emoji left to remove** — this is purely a fidelity pass on the SVG content.

Helpers already present:
- `FL(inner)` → wraps inner SVG in `<svg class='flagsvg' viewBox='0 0 9 6'>…</svg>` (3:2 ratio).
- `HT(...colors)` → equal horizontal bands. `VT(...colors)` → equal vertical bands.
- `st(x,y,r,c)` → places a reusable star (`<use href='#s'>`) at x,y scaled by r in colour c. Shared `<defs>` provide `#s` (star) and `#uj` (Union Jack), etc.
- Flags render via `.flagsvg` (sized by context CSS) inside `<span class="fl">` / `.mc-fl` / `.team-flag` etc.

Render sites all consume `TEAMS[code][1]`, so **no render code changes** — the entire change is the SVG content of `FLAGS` entries plus, if needed, one or two new shared helpers/defs.

## Constraints / non-goals

- **Self-contained**: stay inline SVG. No external flag assets, no `flags/` folder, no CDN, no build step. (Approach B was explicitly rejected.)
- **Stylized, not traced**: emblems are simplified silhouettes/marks that read at ~16px, never traced heraldry. A faithful Mexican eagle is a brown blob at chip size, so the goal is *differentiation and correct identity*, not photographic accuracy.
- **Compact**: each flag stays a short path set; do not balloon the file with detailed coats of arms.
- **No render-site, layout, or data-model changes.** Only `FLAGS` (and shared `defs`/helpers) change.
- Not adding emblems to flags that are genuinely plain (France, Belgium, Netherlands, Germany, Austria, Norway, Sweden, Japan, etc. stay as-is if already correct).

## Fidelity bar (acceptance criteria, applied to every flag)

1. Correct field layout, band proportions, and hex colours per the official flag.
2. A stylized distinguishing emblem is present **wherever the real flag has one AND its absence makes the flag read as another flag in this 48-team set, or as a bare/generic field.** Flags that are correctly plain get no emblem.
3. **Emblem-shape rule (decides whether a flag needs work):** an emblem whose *shape reads as the wrong thing* (e.g. a star where the real flag has no star) MUST be replaced with a mark of the correct kind. An emblem that is already the *right kind of mark* but simplified/crude MAY stay. A flag with no emblem where the real flag has a prominent one MUST gain one.
4. **Two-size goal, stated honestly (resolves the small-size limit):**
   - At **52px hero**: the emblem must be identifiable as the right *kind* of mark (an eagle-ish silhouette, an arms disc, a checkerboard, a sun, etc.).
   - At **~16px chip**: emblems will not be legible as detail and that is accepted. The bar at 16px is **differentiation only** — the flag must not read as a *different* flag in the set. (Criterion 1 colours/layout carry most of the 16px identity; the emblem only has to register as "something is there.")
5. **Per-flag acceptance for the must-fix pair (objective, presence-based):**
   - **MEX** — must NOT be a bare tricolor: a dark central emblem mark occupying roughly the middle third of the white band, visually distinct from CIV and any other vertical tricolor in the set. (Italy is the motivation but is *not* in the 48, so it is not an acceptance check — the in-set risk is other vertical tricolors, esp. CIV `VT` orange/white/green.)
   - **ECU** — emblem disc enlarged to ≥ ~0.8r with a contrasting outline/fill so it is unmistakable directly beside COL; COL stays plain (correct).
6. Inline, self-contained, compact (no traced heraldry; cap emblem path complexity).

## Scope: full 48 audit

Every flag is checked against the bar and classified:
- **Must-fix (identity wrong/confusable):** MEX (no emblem; bare tricolor), ECU (emblem too faint vs COL).
- **Wrong-emblem-shape (emblem reads as the wrong kind — replace per criterion 3):** EGY (gold *star* where the real flag has the Eagle of Saladin), IRN (red *star* where the real flag has the tulip/takbir emblem). Higher priority than the "crude" bucket because the shape actively misleads.
- **Right-emblem-but-crude (may stay if it reads as the right kind at 52px; touch up only if weak):** HAI (white panel placeholder for arms), KSA (shahada+sword as bars), IRQ (takbir bars), BRA (globe), ESP (arms rect), POR (armillary+shield), CRO (checkerboard). 
- **Verify-only (expected no change):** CPV (already has the 10-star ring), the plain tricolours/crosses and already-faithful flags (FRA, BEL, NED, GER, AUT, NOR, SWE, JPN, CAN, SUI, QAT, USA, ARG, URU, AUS, NZL, SEN/GHA stars, etc.).

Every one of the 48 is explicitly signed off against the bar even if unchanged.

The implementation works flag-by-flag; "audit" means each of the 48 is explicitly looked at and signed off against the bar, even if unchanged.

## Components / units

- **`FLAGS` data object** — the only thing that changes. Each entry edited in place.
- **Shared `<defs>` / helpers** — may add one reusable emblem primitive (e.g. a generic "coat-of-arms disc" or an eagle silhouette path) if 2+ flags can share it; otherwise emblems are inline per flag. Keep helper additions minimal and only when they reduce duplication.
- **Dev-only verification gallery** — a throwaway script/overlay (not shipped) that renders all 48 flags at chip size (~18px) and hero size (52px) side by side for screenshot QA. Already prototyped during brainstorming.

## Data flow

`FLAGS[code]` (SVG string) → line ~1137 copies into `TEAMS[code][1]` → consumed unchanged by every render site (`sideHTML`, mate chips, scorers board/table, group standings, calendar entries, bracket, team filter, match modal, team hero, map popover). Changing the SVG string propagates everywhere automatically.

## Error handling / risks

- **Muddy at small size**: detailed emblems become illegible at 16px. Mitigation: stylize to a recognizable silhouette/disc; verify at 16px in the gallery, not just large.
- **File bloat**: traced arms inflate the single file. Mitigation: compact paths only; cap emblem complexity.
- **New collisions**: a stylization could accidentally resemble another flag. Mitigation: the gallery QA checks the whole set together, plus explicit ECU-vs-COL and MEX-vs-tricolor side-by-side.
- **Inconsistent emblem language**: emblems drawn in differing styles look haphazard. Mitigation: a shared stylization convention (simple filled silhouettes, limited palette per emblem).

## Testing / verification

1. Build the dev gallery as a **temporary `<div>` overlay injected via the browser console / preview eval** (not an edit to `index.html`), so it cannot be shipped by accident. Screenshot all 48 at **chip (~18px)** and **hero (52px)** sizes.
2. For each flag confirm: (a) correct country identity at 52px, (b) at 16px it does not read as a *different* flag in the set (differentiation, per criterion 4 — emblem detail is not expected at 16px).
3. Explicit checks: ECU placed next to COL (must differ at a glance); MEX must not read as a plain tricolour and must differ from CIV.
4. Spot-check a real card, the team hero, the scorers board, and the team-filter list to confirm flags render correctly in their actual contexts (not just the gallery).
5. Confirm the inline `<script>` still parses: extract the main script block (the last `<script>…</script>` in `index.html`) to a temp file and run `node --check`. Confirm the committed diff contains **only** `FLAGS`/`defs`/helper changes — no render-site or gallery code.
6. Verify visually BEFORE shipping (per project lesson: inspect, don't eyeball after the fact). File-size delta should be modest (compact paths only).

## Out of scope

- External/bundled flag assets (Approach B).
- Any render-site, CSS-layout, or data-model change.
- Re-drawing flags that already meet the bar.
