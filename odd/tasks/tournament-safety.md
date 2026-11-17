# tournament-safety

Judge-side safeguards found by auditing the 2026-11-16 foil tournament database (bout 4 result lost,
double taps, recreated bouts with swapped sides, accidental red card finishing a bout).

## Specs

- S1 Touch limit: «Campo obligatorio» + «Recordar el último de la pista» («Ambas»): the bout setup form
  cannot be submitted without a touch limit, and it is prefilled with the weapon, periods and touch limit
  of the previous bout started on that piste from this device (names are not prefilled).
- S2 Double tap: «Ignorar mismo lado < 1 s»: «Un segundo toque del mismo tirador dentro de 1 segundo se
  descarta. En florete no hay dos toques válidos tan seguidos.»
- S3 Swap sides: «Solo antes de empezar»: «Disponible mientras el asalto no arrancó (0-0, sin reloj).
  Solo intercambia los nombres; es el caso que vimos (asaltos 10, 22).»
- S4 Red card: «Confirmar + poder deshacer»: «Igual que la negra: pide confirmación solo si esa roja da el
  último toque, y permite retirarla con el asalto terminado.»

## Tasks

- [x] T1 S1 required + remembered touch limit — inline — commit: 2f56fce
- [x] T2 S2 ignore same-side touch within 1 s — inline — commit: 65fd560
- [x] T3 S3 swap sides before the bout starts — inline — commit: cf8f90f
- [x] T4 S4 confirm and take back a bout-ending red card — inline — commit: 20680ef
- [x] T5 S4 take back a red card that finished the bout in sudden death (extra period) — gentle-ai-worker — commit: c5b6d6d

## Delivery

Slice boundary: PR 1 = T1-T3 (2f56fce..cf8f90f); PR 2 = T4-T5 (20680ef..c5b6d6d), stacked on PR 1.

## Log

- L1 (user): "me parece bien ir con los puntos 1 a 3. No estoy seguro del 4. Hablé con el organizador del
  torneo y me dijo que en los casos de asaltos que no avanzó el tiempo usaron un reloj externo
  intencionalmente, lo que si me dijo que hubo un caso en el que pusieron una tarjeta roja accidentalmente
  que finalizó el combate, por lo que se me ocurre que podríamos hacer algo parecido a lo que hicimos para
  la tarjeta negra en caso de que valla a finalizar el combate."
  Points 1-3 = proposed fixes (required touch limit, double tap, swap sides); 4 (name autocomplete) out
  of scope; piste 2 clock was intentional (external clock), not a defect.
- L2 (user answers): touch limit «Ambas»; double tap «Ignorar mismo lado < 1 s»; swap «Solo antes de
  empezar»; red card «Confirmar + poder deshacer».
- L3 decision: server schema keeps touchLimit optional (changing a consumed API contract is out of scope);
  the safeguard lives in the judge form.
- L4 verify (gentle-ai-verify, T4): FAIL. A red card in the extra period finishes the bout with reason
  'sudden-death'; the dialog asks for confirmation but the red can never be taken back:
  packages/web/src/core/scoreboard-view.ts redFinishedBy accepts only 'touch-limit', and domain
  packages/domain/src/scoring.ts removeCard counts only touch-limit as caused by a red and reopens to
  'fencing'. Fix: removing the red card that decided sudden death (winner = opponent of the penalized
  side) reopens to 'extra-period' with the clock stopped and priority kept; the view offers the toggle.
  Note (open, user decision): renaming after a red finish moves lastAt and locks the take-back.
- L5 T5 done (c5b6d6d): domain removeCard reopens the extra period for the deciding red (also requires the red's at === lastAt, so an earlier red before a regular deciding touch stays locked). Checks: domain 162, web 471, server 202 tests passed; tsc and svelte-check clean.
- L6 verify (gentle-ai-verify, T5): PASS with notes. Sudden-death red take-back reopens extra-period (clock stopped, priority kept); regular-touch/priority/winner-side cases stay rejected; touch-limit and black take-back identical to base; stored logs replay identically. Notes: rename lock (open L4 decision); long comment line wrapped.
