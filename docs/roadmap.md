# Roadmap — WAR MODE

> What's done, what's next, and what needs the user. Keep current.

## Done
- **Repo hygiene:** consolidated duplicates, git-initialized, non-destructively merged with the
  existing GitHub remote (PWA files preserved).
- **Restructure:** single-file dashboard → `index.html` + `styles.css` + classic-script `js/`
  modules; behavior-verified identical.
- **Food Phase 1 (no AI):** pantry/items, meals, daily logging, oil capture, repeat-yesterday,
  deterministic math, Supabase sync (local-first), Tracker bridge.
- **Food UX overhaul + clean-light redesign (Food-scoped):** 1,750 target + buffer, calories +
  protein rings, always-on meal slots with subtotals + `+`, smart recency suggestions, spacious
  detail card, iOS quantity wheel, per-product units, per-day meal overrides, manual "Done for the
  day" push, aliases, hidden Pantry, scroll-hide top bar, Plus Jakarta Sans.

## Next — needs the user
1. **Review the redesigned Food tab on his own device** (screenshots don't work here). Collect
   tuning feedback.
2. **Send his real breakfast/lunch/dinner foods** → pre-seed slot suggestions.
3. **Calibrate ~15 most-eaten seed items** to real numbers (seed→verified).
4. Decide whether to **replicate the clean-light look** to Fitness/Health/Tracker.

## Next — engineering
- **Phase 2 gate (ADR-0011):** one hard-coded Anthropic call from the live Netlify site to test
  CORS/auth. Report; add a Netlify Function proxy if blocked. **Do this before any AI UI.**
- Then Phase 2 in order (model `claude-sonnet-4-6`, strict-JSON, code does all math):
  1. Label scan → negotiation chat → save verified item.
  2. Screenshot import (same pipeline).
  3. Natural-language logging ("3 paratha and paneer kebab").
  4. AI general-estimate fallback → flagged → user-verified → auto-saved to pantry (cache loop).
  5. **AI dedup:** image of an existing item edits it (use `findItemByNameBrand`), never duplicates.
- Consider a minimal `foodMath` test harness.
- Bring the meal builder editor up to the clean-light detail-card standard.

## Working-agreement reminders (see CLAUDE.md)
- Plan mode + approval before multi-step work.
- P0/P1/P2 triage on long feedback lists before implementing.
- Documentation-only pass after each stable feature.
- Delegate final verification to a subagent with the diff + acceptance criteria.
