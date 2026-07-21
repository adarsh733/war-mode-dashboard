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
- **Phase 2 AI layer (built, not yet run live):** Netlify Function proxy with PIN + daily cap +
  task whitelist; label scan → verified item; natural-language logging; meal-name suggestions; web
  lookup for unknown foods; draft-only plate photos. All bound by the accuracy contract
  ([ADR-0024](decisions.md)) and a deterministic validator that passes all 158 seed items with zero
  false positives.

## Next — needs the user
1. **Review the redesigned Food tab on his own device** (screenshots don't work here). Collect
   tuning feedback.
2. **Send his real breakfast/lunch/dinner foods** → pre-seed slot suggestions.
3. **Calibrate ~15 most-eaten seed items** to real numbers (seed→verified).
4. Decide whether to **replicate the clean-light look** to Fitness/Health/Tracker.

## Next — engineering
- **Phase 2 gate:** run ⚡ **Test AI connection** on the deployed site. ADR-0011's "test a direct
  browser call" is superseded — a public site can't hold an API key, so the proxy was mandatory and
  the gate is now "does the proxy round-trip work" ([ADR-0023](decisions.md)).
- Then, once it's green: scan one real label end-to-end and check the numbers against the packet by
  hand; watch actual spend for a week (`usage` comes back on every call).
- Bring the meal builder editor up to the clean-light detail-card standard.
- Possible follow-ups now that the AI layer exists:
  - Voice input into the natural-language box (Web Speech API — no extra API cost).
  - Make the daily cap exact via a shared counter row (see [known-issues](known-issues.md)).
  - Barcode lookup as a cheaper, more reliable path than label OCR for packaged goods.

## Working-agreement reminders (see CLAUDE.md)
- Plan mode + approval before multi-step work.
- P0/P1/P2 triage on long feedback lists before implementing.
- Documentation-only pass after each stable feature.
- Delegate final verification to a subagent with the diff + acceptance criteria.
