# Coherent screens

## Objective
Make every non-bout screen consistent with the redesigned judge bout view: shared icon button, state/surface tokens, compact headings and notices, icon actions with title + aria-label.

## Defaults assumed (not yet confirmed)
- Spectator TV-scale sizes (PisteFace numerals) stay; only chrome (back, footer, banner) is unified.
- Accessible names asserted by existing tests are preserved (aria-label keeps the full text).
- Judge bout view visuals must not change.

## Tasks
- [ ] C1 Foundation in app.css: --surface/--surface-2, --ok/--warn/--danger tokens, shared `.icon` (+ .sm/.on/.danger), `.page` step rules, unified `.notice`, focus ring for icon/cards; an `Icon.svelte` (name prop) for repeated SVGs; Scoreboard/ConnectionBar/ScoreboardScreen consume the shared classes with no visual change
- [ ] C2 Admin (AdminPistes) icon actions, one button height, shared card/input
- [ ] C3 Piste list + entry steps (PisteListScreen, PinStep, ChooseStep, ConfirmNewStep, JudgeScreen offline/checking) use `.page`, compact header, icon refresh/board
- [ ] C4 Shell + spectator chrome + correction sheet + banners (App header, SpectatorScreen back/footer/banner, CorrectionSheet icon quick-resets/close, UpdateBanner, ConnectionBar attention notice, PisteCard tokens)

## Acceptance
- vitest web + svelte-check pass; existing accessible names/selectors stable (.card-dot, .card-screen, aria-labels).
- Manual device check of each screen.

## Progress / evidence
(none yet)

## Next step
C1
