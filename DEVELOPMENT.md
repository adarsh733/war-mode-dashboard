# DEVELOPMENT.md — how we work on WAR MODE

> The engineering process (the *how*), expanding the day-to-day loop. The **authoritative policy is
> the "Working agreement" in [CLAUDE.md](CLAUDE.md)** — if anything here conflicts with it, CLAUDE.md
> wins. This file adds the concrete steps and conventions.

## The loop (default for any change)

1. **Never assume — investigate first.** Read the code / docs, reproduce, confirm the real cause.
   Cite files/lines. No guessing.
2. **Propose before implementing.** For anything multi-step, use **plan mode** and get explicit
   approval before writing code. For a long feedback list, first triage into **P0 / P1 / P2** with
   effort + risk estimates and confirm the order.
3. **Implement** the smallest coherent change that satisfies the agreed scope. Match existing
   patterns; don't refactor untouched legacy casually.
4. **Verify in the browser via DOM/JS inspection** (not screenshots — the capture tool is broken
   here). Exercise the real flow; assert numbers by hand where math is involved. Test writes on a
   **throwaway date** and clean up so real data / Supabase isn't polluted.
5. **Fix all console errors** before calling anything done. Zero errors is the bar.
6. **Delegate final verification to a subagent** with only the diff + acceptance criteria — don't
   self-verify the "done" claim in the main thread.
7. **Commit locally** with a descriptive message (end with the `Co-Authored-By: Claude Opus 4.8`
   trailer). **Wait for the user before pushing** — pushing deploys to Netlify.
8. **After a feature reaches a stable state, do a documentation-only pass** (no code): update
   `docs/` and `CLAUDE.md` so a cleared chat can resume from files.

## Verification specifics (this environment)

- **Screenshots don't work** — every capture times out on all ports. Verify structure/values with
  `read_page` / `javascript_tool`, and tell the user when a *visual* review must happen on their
  device.
- **The preview browser caches JS hard.** After editing a `.js`, a plain reload may serve stale
  code. Bump the port in `.claude/launch.json` and restart the dev server, or hard-reload.
- Run locally: `python -m http.server <port>` → `http://localhost:<port>/index.html`
  (port lives in `.claude/launch.json`; bump it when the preview serves stale JS).
- Keep the math source of truth in `js/food/foodMath.js` (pure, testable); verify totals against it.

## Git / release discipline

- The repo is the memory. Commit in coherent stages; never mix unrelated changes.
- Branch off `main` for risky work; git-checkpoint before large/irreversible changes.
- **Local commits are fine anytime; pushing is user-gated.** Push (→ Netlify deploy) only when the
  user says so.
- Private medical data lives **outside the repo**, one level up in `../Medical Records/`,
  `../Physique Progress/`, `../Trackers/`. It is not in git at all; `.gitignore` keeps
  matching patterns only as a backstop.

## Documentation cadence — what to update when

| When | Update |
|------|--------|
| Focus/sprint changes | `docs/current-focus.md` |
| Behavior / targets / hidden features change | `docs/product-spec.md` |
| A significant call is made | add an ADR to `docs/decisions.md` |
| Anything visual changes | `docs/design-system.md` |
| Structure / storage / module map changes | `docs/architecture.md` |
| Schema / math changes | `docs/data-model.md` |
| New quirk / debt / risk found | `docs/known-issues.md` |
| Plan shifts | `docs/roadmap.md` |

## Product/context guardrails (don't forget)

- Single vegetarian user — **never** suggest meat/fish/egg anywhere.
- **Accuracy > features.** A silent 200–300 kcal error is a real failure. Deterministic JS does all
  math; AI (Phase 2) only proposes numbers a human confirms. Keep trust badges honest.
