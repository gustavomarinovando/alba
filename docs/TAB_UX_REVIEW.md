# Alba — Tab-by-Tab UI/UX Review

**Method note:** this is a code-based structural review (render functions + CSS), not a live visual
pass — the app is behind a login I don't have credentials for. Everything below is grounded in
actual `App.tsx`/`styles.css`/`TemperatureChartPanel.tsx` line references, but I haven't *seen* it
rendered. If you want a pixel-level pass (spacing, actual contrast, real device rendering), send
screenshots of each tab in both themes (Líquida/Clásica) and both light/dark and I'll do a second,
sharper pass on top of this one.

## Priority fixes (do these first — highest impact, most already isolated)

1. **Backdrop-filter is applied unconditionally in the base theme, not just `.ui-liquid`.** The code
   already contains the right lesson, written down, but only half-applied: `styles.css:3594-3595`
   says *"buttons appear dozens of times per view and each blur forces its own compositing layer —
   that was the source of visible lag"* — but that fix is scoped to `.ui-liquid` only. The **default
   `.panel` class blurs on every tab in both themes** (`styles.css:116-117`), the **base
   `.calendar-day` rule blurs all ~42 day cells** unconditionally (`styles.css:346`) even though the
   `.ui-liquid` override for the same class explicitly opts out with a comment about exactly this cost
   (`styles.css:3638-3641`), and Today's `.input-card`/`.temperature-saved-row`/`.advanced-panel`
   all carry their own blur layer per instance (`styles.css:552-641`) — so a day with 2-3 saved
   temperature readings is compositing 4-6+ separate blur layers. **This is very likely the root
   cause of the "still laggy" feedback from earlier** — it was never fully fixed, only fixed for one
   theme. Fix: audit every unconditional `backdrop-filter`/`backdrop-blur-*` and either remove it or
   make it a single outer layer (one blur on the page background, not one per repeated card/cell).

2. **Calendar's period-intensity colors are indistinguishable.** `.flow-light`, `.flow-medium`,
   `.flow-heavy` (`styles.css:369-379`) are three separate rules that all just apply the same
   `bg-coralLight` — a real bug, not a design choice. Light/medium/heavy flow currently look
   identical on the calendar.

3. **Main tab bar has no ARIA tab semantics**, while two other tab-like UIs in the same codebase
   (auth login/signup, the streak-prize modal) do it correctly (`role="tablist"`/`role="tab"`/
   `aria-selected`). Trivial, consistency-only fix, but it's the primary navigation — worth doing.

4. **A checkbox that can't be unchecked.** Today tab's "Reposo" checkbox on the temperature-entry
   card is `checked readOnly` (`App.tsx:1920-1923`) — it renders as an interactive control but does
   nothing when tapped. Either wire it up or don't render it as a checkbox.

5. **Two different destructive-action confirmation patterns in the same app.** Settings' "Borrar"
   (wipe all data) uses a native `window.confirm()` (`App.tsx:864-884`); Today's "delete day" uses a
   custom-styled `confirm-box` component (`App.tsx:1859-1872`). Pick one pattern for anything
   irreversible — the custom one, since native `confirm()` can't be styled/branded and looks broken
   next to the rest of the app.

## Today tab

**What's there:** two panels — a day-summary card (4 stats + a clickable streak/rewards button) and
a "Registro del día" form that itself contains 4 nested `input-card`s (Temperatura, Periodo, Señales
opcionales, Nota libre), plus a per-reading expandable row for every saved temperature that day.

**Appearance**
- Card-in-a-card nesting (outer `Panel` → `input-card` → per-reading `<details>` row) reads fine at
  a glance but the visual hierarchy between "panel," "input-card," and "saved-reading row" is thin —
  they're differentiated mostly by blur intensity and border, not by a clear size/weight step. Worth
  a deliberate 3-level visual scale (panel > card > row) rather than three similar-looking boxes.
- See Priority Fix #1 — this tab accumulates the most blur layers of any tab once a day has multiple
  readings, and is very likely where "laggy" is most felt.

**Experience**
- **Control density**: a day with 2-3 temperature readings and "Señales opcionales" expanded can
  reach 25-30+ interactive elements on one screen. That's a lot of surface area for what should be a
  30-second daily habit. Recommend: collapse "Señales opcionales" content behind a genuinely
  secondary disclosure (it already toggles, but consider defaulting saved-reading rows to a compact
  one-line summary instead of a full 5-control `<details>` block, expanding only on tap) — most days
  someone logs once and never needs to re-edit a specific past reading inline.
- **Panel reordering isn't breakpoint-scoped.** `shouldPrioritizeEntry` swaps which panel comes first
  based on "is this today and is temperature missing," not on viewport width (`App.tsx:626`,
  `2457-2461`) — so the layout reorders on desktop too whenever that condition is true. Confirm this
  is intentional; if the goal was "put the form first on mobile so it's not buried," it's currently
  doing that on desktop as well, which could feel inconsistent to a returning user who's used to the
  summary being on top.
- The "Reposo" fake-checkbox (Priority Fix #4) sits right next to real, working controls — that's
  the kind of inconsistency that erodes trust in the rest of the form.

## Calendar tab

**What's there:** month grid, ~42 day-button cells, prev/next month nav, phase shown as a colored
inset border, period shown as a background tint.

**Appearance**
- Flow intensity indistinguishable (Priority Fix #2) — this is the most visible actual bug found in
  the review.
- Phase is entirely color-coded (`styles.css:381-409`, box-shadow border only) with no icon/pattern
  backup — fine for sighted users with good color vision, a real gap otherwise. A 1-2px difference in
  border style (dotted vs solid) or a tiny corner glyph per phase would fix this cheaply.
- Backdrop-blur on all 42 cells unconditionally (part of Priority Fix #1) — Calendar is a strong
  candidate for "first thing to feel smoother" once that's fixed, since it's the tab with the most
  repeated blurred elements per screen.

**Experience**
- **No empty state at all.** A brand-new user with zero entries sees a grid of plain numbered buttons
  with no guidance — every other data tab (Today, Chart, Map) has at least some onboarding copy;
  Calendar has none. Add a one-line hint ("Toca un día para empezar a registrar") for a genuinely
  empty month.
- Nav buttons are `title`-only, not `aria-label`led — inconsistent with Map's equivalent buttons.
  Small fix, same pattern exists correctly elsewhere in the codebase to copy from.

## Temperature chart tab

**What's there:** a `recharts` line/area chart with phase-colored background bands, a coverline
reference, period days marked as 💧 emoji, pan (drag) and zoom (buttons) controls.

This is the best-executed tab of the five, structurally: CSS-variable-driven (adapts to both themes
by construction, not by override rules), has the clearest, most conventional empty state of any tab
("Registra tus temperaturas para verlas en un gráfico."), and its own performance concerns are
already isolated (no unconditional multi-instance blur — the panel is a single instance).

**Appearance**
- The hollow-vs-filled temperature dot (questionable/non-resting reading vs. normal reading) has
  **no legend anywhere on the tab** — it's a real, meaningful distinction (it affects whether a
  reading counts toward the coverline calculation) but currently undiscoverable unless someone
  already knows to look for it. Add a one-line legend under the chart, or a tooltip note.
- Tooltip hardcodes `backdropFilter: blur(14px)` regardless of theme (`TemperatureChartPanel.tsx:195`)
  — probably fine visually, but worth confirming it doesn't look wrong against the "no blur in this
  spot" liquid-theme philosophy used elsewhere.

**Experience**
- Nav buttons are `title`-only (same fix as Calendar).
- Pan is pointer-drag only — no keyboard equivalent for panning the window. Minor since the two
  window-shift buttons exist as a fallback, but worth a quick check that they're sufficient for a
  keyboard-only user to reach any date range.
- This component maintains its own duplicate `Panel` implementation (`TemperatureChartPanel.tsx:264`
  vs. `App.tsx:2670`) purely as a workaround for the lazy-load reveal-animation timing bug (already
  fixed for the AI chat panel using the same pattern earlier this session). Worth deduplicating once
  there's a shared component location — small tech-debt item, not urgent.

## Map tab (cycle wheel)

**What's there:** a radial SVG wheel — one dot per day of the active cycle arranged in a circle,
colored by phase, with a fertile-window "sperm cue" decoration and a glowing "today" marker. Center
shows the selected day's detail; a side panel shows a fuller stat breakdown.

This is the most visually distinctive tab and, structurally, the best-implemented for
accessibility of the bunch — every day dot is a real `role="button"` with a proper `aria-label` and
keyboard (`Enter`/`Space`) support, and the nav buttons here (unlike Calendar/Chart) do get
`aria-label`s.

**Appearance**
- Two hardcoded hex colors (`#17201d`, `#fff` — `styles.css:761-776`) instead of the `--color-ink`
  custom property used almost everywhere else. Likely intentional (numbers sit on solid phase-colored
  dots, not the themed background) but worth a deliberate confirm rather than an oversight — if
  someone adds a light phase color later, white-on-light-dot could go low-contrast.
- Legend is color-chips-only, same color-only-indicator pattern as Calendar's phase borders.

**Experience**
- **Every day of the cycle is individually tab-stoppable** — for a 28-45 day cycle that's 28-45
  sequential tab stops before a keyboard user reaches the legend or the detail panel below. The
  interaction pattern is *correct* (real button semantics, real labels) but the sheer count could be
  a genuine keyboard-navigation fatigue point. Consider either a "skip to detail" link, or grouping
  days into a `role="listbox"` with arrow-key navigation instead of relying on sequential Tab.
- The wheel is a strong, memorable visual — this is a good differentiator vs. competitors' plain
  calendar/linear views and worth leaning into more (e.g. it's arguably a better "hero" visual for
  marketing screenshots than the calendar or even the chart — see the launch roadmap's go-to-market
  notes about leading with distinctive surfaces).

## Settings tab

**What's there:** one long panel, 6 sections: Account, Appearance, Privacy/backup, Reminders,
"Experiencias" (custom-date cosmetic content), Avatares (a non-interactive preview strip).

**Appearance**
- Settings sections use `border-radius: 1.25rem` (`styles.css:2209`) while the shared `Panel`
  component every other tab uses has Tailwind's default `rounded` (~0.25rem). Settings cards are
  visibly rounder than every other tab's cards — likely unintentional drift, not a deliberate
  design choice, since nothing else in the app signals "Settings should look different."
- Login form inputs use ad-hoc inline Tailwind classes instead of the app's shared `.input` class
  (`App.tsx:2200-2213`) — small, but it means any future global input restyle will silently miss
  these two fields.
- The CSS for this tab's classes is written in a dense, single-line-per-selector-block style,
  noticeably different formatting from the rest of the file (`styles.css:2199-2211`). Not
  user-visible, but a maintainability flag — future edits here are more error-prone to review.

**Experience — this is the tab most worth restructuring**
- **Destructive actions sit in the same visual weight as harmless ones.** "Borrar" (wipe everything)
  is one of six equally-sized buttons in a grid alongside "Exportar" and "Probar conexión Supabase"
  (`App.tsx:2242-2271`). For an action with no undo, it should look and feel different — separated,
  differently styled, maybe requiring a second confirmation step beyond a browser `confirm()` dialog
  (see Priority Fix #5).
- **Account security, destructive data ops, OS permissions, and pure cosmetics are flattened into one
  list with equal visual priority.** Concretely: section 1 (account/security) and section 3
  (destructive data operations) are high-stakes; section 5 (Experiencias) and section 6 (Avatares)
  are low-stakes/delight content. Recommend regrouping into two visually distinct zones — e.g. a
  "Cuenta y datos" group (account, privacy/backup, reminders) and a "Personaliza" group (appearance,
  experiencias, avatares) — even without a full sub-navigation, a clear section-header hierarchy
  change (bigger gap, a group eyebrow) would fix the "everything looks equally important" problem.
- **The Avatares section isn't a setting.** It's explicitly described in its own copy as a preview
  for a not-yet-built feature (nothing in it is configurable). Either label it clearly as
  "Próximamente" so it doesn't read as broken, or move it out of Settings entirely until it's
  interactive.

## Cross-cutting patterns worth fixing once, everywhere

- **Icon-only nav button labeling is inconsistent**: Map does it right (`aria-label`); Calendar and
  Chart rely on `title` only. Same interaction, three tabs, two different a11y treatments — a
  five-minute fix once you decide on the standard (recommend `aria-label`, since `title` doesn't
  reach touch/screen-reader users reliably).
- **Color-only status indicators** show up in four places (calendar phase border, calendar flow
  intensity, map legend, chart dot fill) with no consistent text/pattern backup. Worth a single
  "how do we encode phase/state visually" decision applied consistently, rather than four separate
  ad-hoc treatments.
- **No onboarding empty-state on Calendar**, while Chart and Map both have one. A brand-new user
  bounces between "helpful empty state" and "here's a bare grid" depending on which tab they land on
  first — worth giving Calendar the same treatment.
