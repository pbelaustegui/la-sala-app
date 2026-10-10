# spectator-idle-chrome

## Objective
On the spectator views, hide the "back to board" and "I'm a judge" (and admin) buttons after a few seconds of inactivity and bring them back on any interaction, so a projected screen stays clean.

## Decisions
- Inactivity timeout: 5 seconds (named constant). Interactions that reveal: pointer move/down, touch, key press, focus inside the controls.
- Hidden controls keep their layout space (opacity, not display) so nothing jumps on a projector, and are not clickable while hidden (a first tap only reveals them).
- Controls never hide while one of them has keyboard focus.
- The brand/title link stays visible. Applies to both the board list and the piste detail.

## Tasks
- [ ] A1 Idle-reveal controller on injectable timers + SpectatorScreen wiring, tests first

## Route
Delegated direct: one writer.

## Out of scope
Judge screens, hiding the stale banner or the brand.
