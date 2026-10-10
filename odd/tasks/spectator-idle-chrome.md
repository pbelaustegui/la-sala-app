# spectator-idle-chrome

## Objective
On the spectator views, hide the "back to board" and "I'm a judge" (and admin) buttons after a few seconds of inactivity and bring them back on any interaction, so a projected screen stays clean.

## Decisions
- Inactivity timeout: 5 seconds (named constant). Interactions that reveal: pointer move/down, touch, key press, focus inside the controls.
- Hidden controls keep their layout space (opacity, not display) so nothing jumps on a projector, and are not clickable while hidden (a first tap only reveals them).
- Controls never hide while one of them has keyboard focus.
- The brand/title link stays visible. Applies to both the board list and the piste detail.

## Tasks
- [x] A1 Idle-reveal controller on injectable timers + SpectatorScreen wiring, tests first

## Route
Delegated direct: one writer.

## Out of scope
Judge screens, hiding the stale banner or the brand.

## Evidence
- RED: `npx vitest run src/core/idle-reveal.test.ts` failed (module missing); `SpectatorScreen.test.ts` idle chrome: 8 failed before wiring.
- GREEN: `npx vitest run` (packages/web): 414 passed; `npm run check`: 0 errors, 0 warnings.
- Design: `core/idle-reveal.ts` (injectable Timers, IDLE_MS=5000, interact/hold/dispose); SpectatorScreen toggles `.idle` + `inert` on `.back`/`.foot` (`data-idle-chrome`), CSS opacity/visibility transition, disabled under prefers-reduced-motion; focus inside the chrome holds visibility.
- Not verified in a real browser (jsdom has no CSS transitions or inert reflection).
