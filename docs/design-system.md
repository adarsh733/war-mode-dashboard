# Design System — WAR MODE

> **One system across all four tabs** (Fitness / Health / Tracker / Food): clean-light,
> Plus Jakarta Sans, a single neon-green brand accent with restrained gradients.
> Unified in [ADR-0021](decisions.md) — this replaced the earlier split between the warm legacy
> identity and the Food-only clean-light system ([ADR-0013](decisions.md)).
> All CSS lives in `styles.css`. Update this file whenever visuals change.

## 1. Typography

- **Plus Jakarta Sans everywhere** (weights 400–800), via the `--ffont` token. It is the only
  font loaded. Oswald, Fraunces and DM Sans are fully retired.
- Set once on `body`; `--ffont` is also used explicitly in inline styles and JS-generated markup.
- Chart.js is configured to the same family (`Chart.defaults.font.family`, `js/charts.js`).

Body carries a slight `letter-spacing:-.005em` — Jakarta is wide by default.

### The type scale ([ADR-0033](decisions.md)) — mobile-first

A ~1.2 (minor-third) ramp, rounded to whole pixels at the pinned `html{font-size:16px}`. Aligned with
iOS HIG (Caption 11–12 / Footnote 13 / Subhead 15 / Body 17) and Material 3 (Label 11 / Body 14).

| Token | px | Use |
|-------|----|-----|
| `--fs-2xs` | 11 | badges, micro-caps, table headers, kcal units |
| `--fs-xs`  | 12 | sub-lines, captions, meta |
| `--fs-sm`  | 13 | secondary text, chips, table cells, `.sec-label` |
| `--fs-base`| 14 | **list item names**, dense body |
| `--fs-md`  | 15 | body, lede, **kcal values**, buttons |
| `--fs-lg`  | 17 | **section + card titles** ("Breakfast"), sheet titles |
| `--fs-xl`  | 20 | sub-headings, detail-card name, date-strip day |
| `--fs-2xl` | 24 | page titles |
| `--fs-3xl` | 28 | **hero numbers** — rings, stat values, `.command .big` |
| `--fs-4xl` | 32 | page titles on ≥820px **only** — the one width-varying size |

Line height: `--lh-tight 1.2` (headings/numbers), `--lh-snug 1.35` (dense list rows),
`--lh-base 1.55` (prose).

**Rules — these are what keep it from drifting back:**
1. **Never write a raw `font-size`.** Always a token — in CSS, in inline `style=""`, and in
   JS-generated markup. 30 ad-hoc sizes with no shared ratio is exactly what made the app feel
   cluttered. The only sanctioned exceptions are **icon/emoji/arrow glyphs** (sized optically, not
   for reading) and **form controls** (see rule 4).
2. **Nothing renders below 11px.** That is the legibility floor.
3. **A row must not out-shout its header.** In a list, section title `--fs-lg` > kcal `--fs-md` >
   item name `--fs-base` > sub-line `--fs-xs`. Emphasise a value with **weight (700), not size**.
4. **Form controls stay ≥16px on touch** — see §5b. Never give an input an `!important` font-size;
   it would beat the zoom guard.
5. **Watch for shadowing.** Food styles are declared twice (legacy v2 block, then the winning v3
   block) and several `@media` blocks re-declare sizes. After changing a size, check the *computed*
   value, not just the rule you edited — four defects in this refactor were later rules silently
   beating tokenised earlier ones.

| Role | Treatment |
|------|-----------|
| Display titles (`h1.title`, `.stat .v`, `.boss .bt`, `.command .big`) | 800, `letter-spacing:-.02em` |
| Slot / card titles | 700, `--fs-lg`, `--lh-tight` |
| Body | 400–500, `--fs-md` |
| Uppercase micro-labels (`.kicker`, `.sec-label`, `.fd-lbl`, `.stat .k`, `th`) | 600–700, `letter-spacing .06–.2em`, muted |
| Numbers | 700–800 |

## 2. Color tokens (`:root` in `styles.css`)

### Neutrals (light theme)
```
--bg #eef1ef      page          --paper  #ffffff   cards
--paper2 #e9eeeb  inset/track   --ink    #17241d   text
--ink2 #3f4f47    secondary     --muted  #7b8a82   muted
--line #e6ece8    hairline      --line2  #d4ded8   stronger border
```

### Brand — neon green (lightest)
```
--accent      #1faa5d   brand green (fills, bars, borders, ring)
--accent2     #63e79a   bright neon stop (gradient light end)
--accent-soft #e6f8ee   light green tint background
--accent-ink  #14713f   ACCESSIBLE green for small text on light backgrounds
--grad        linear-gradient(135deg, var(--accent2), var(--accent))
--grad-soft   very light green wash (command deck, soft panels)
```

### Semantic status — preserved, they carry meaning
```
--green #3f9d5a  --green-bg #e6f4ea  --green-ink #256b3d
--amber #dd9a2b  --amber-bg #fbf1dc  --amber-ink #8a5c10
--red   #d75a4a  --red-bg   #fbe9e6  --red-ink   #a3392b
--blue  #3b7fc4  --blue-bg  #e7f0f9  --blue-ink  #255d94
--violet #7a6bd6 --violet-bg #ece9fb
```

**The `-ink` rule:** base tokens are vivid and belong on **charts, bars, rings and borders**.
The `-ink` variants are the **text** colors on the matching `-bg` tint (pills, badges, chips) and
all pass WCAG AA (~5.2–5.9:1). Never put a base token on its own tint as small text — that combo
sits near 2–3:1. Same applies to `--accent`: use `--accent-ink` for small green text on white.

**Green vs green:** `--accent` is the *brand*; `--green` is *semantic success*. They are close but
intentionally distinct. Consequence: **no chart may plot `--accent` and `--green` together** — they
would read as one series. `js/charts.js` uses `--violet` for the second series in `cWaist` and
`cComp` for exactly this reason.

### Food-specific tokens
The `--f*` set (`--fbg`, `--fcard`, `--fink`, `--fmut`, `--fline`, `--fr`, `--fshadow`) still scopes
Food layout. `--fgreen` is unified to the brand green `#1faa5d` as a **literal hex** — the canvas
rings read it through `cssv()`, which needs a real color string, not a `var()` reference.

## 3. Shape, depth, motion

- Radius: `--r 16px` global cards; Food cards `--fr 18px`; inputs 10–14px; detail card 24px top.
- Shadows: `--shadow` / `--shadow-sm` (soft, low-contrast, green-tinted).
- Generous padding (cards 16–24px). Airy.
- Sheets slide up (~.25–.28s); topbar hide/show `.3s`; ring draw ~.45s.

## 4. Gradient usage — neon & restrained

`--grad` and semantic gradients (`--grad-green`, `--grad-amber`, `--grad-red`, `--grad-blue`, `--grad-violet`, `--grad-gold`) are used for **primary interactive surfaces, status pills, and canvas rings** ([ADR-0038](decisions.md)):
active seg toggle, `.btn-primary` / `.btn-primary.wide`, `.fd-btn.primary`, `.fslot-add`, `.ci-tab.on`,
`.fseg button.on`, `.fd-chip.on`, plus the `.wm` wordmark (ink→green), `--grad-soft` on the command deck, and **135° canvas linear gradients** for the protein and calorie hero donut rings (`foodRingGradient`).
Page bodies stay clean white/light.

## 5. Components

- **`.card` / `.fcard`** — white, hairline border, soft shadow.
- **Nav/tabs:** `.seg` top toggle — active = green gradient, **identical on all four tabs** (no
  per-section accent). `.subnav .chip.on` = `--accent-ink` text + bright `--accent` underline.
- **`.stat`** — value 800; `.bar` left edge uses a semantic gradient token (`--grad-*`).
- **`.pill`** (`p-green/amber/red/blue/ink`) — `-bg` tint + `-ink` text.
- **`.command`** (Tracker daily deck) — light `--grad-soft` card, white panels, green headline number.
- **`.note`** (`good/warn/bad/info`) — semantic tint with its own dark text.
- **Food:** hero rings (calories + protein with 135° neon canvas gradients), `.fslot` slot cards with round green `+`, suggestion
  chips, `.logrow` entries, `.fd-*` detail card, `.qwheel` quantity wheel (item height **46px**, kept
  in sync with `QWHEEL_IH` in `foodDetail.js`).
- **Badges/legend:** items = green, meals = blue, ad-hoc = amber — a *data* distinction, so these
  stay non-green by design.

**Ring colors:** 135° canvas gradients. Calories = neon green gradient, red gradient when over 1,750. Protein = neon green gradient ≥180, amber gradient 140–180, red gradient <140.

## 5b. Mobile rules (non-negotiable — ADR-0022)

This is used daily in a phone browser, so these are correctness rules, not polish:

- **Never let a form control render under 16px on touch.** Below that, iOS Safari zooms on focus and
  never zooms back out. Enforced globally by
  `@media(max-width:640px),(pointer:coarse){input,select,textarea{font-size:16px!important}}`.
  Keep the `pointer:coarse` arm — phone landscape is a wide viewport but still touch.
  Do **not** "fix" zoom with `maximum-scale=1`; that disables pinch-zoom.
- **`overflow-x:clip`, never `overflow-x:hidden`** on `html`/`body`. `hidden` creates a scroll
  container and breaks `position:sticky` on the topbar/subnav.
- **Any horizontally scrollable element needs `overscroll-behavior-x:contain`**, or its scroll
  chains out to the page and drags the whole layout sideways.
- **Safe-area insets belong in the element's own rule.** A separate earlier `padding-*:env(...)`
  declaration is dead code if the real rule later uses the `padding` shorthand.
- **Sticky offsets must include the safe-area inset** they sit below
  (`.subnav{top:calc(105px + env(safe-area-inset-top))}`).
- **Chip rows scroll, they don't wrap** — one row, `flex-wrap:nowrap` + `overflow-x:auto`, chips at
  `flex:0 0 auto`, bled to the card edge so a half-visible chip signals more content.
- Top bar auto-hides on scroll-down in **every** section (`body.nav-hidden`).
- **Swipe left/right moves between subtabs** along one chain across the whole app
  ([ADR-0032](decisions.md)). Pages arrive with a direction-aware slide — `.page.active.nav-fwd`
  (from the right) / `.nav-back` (from the left), ~.28s — applied to **chip taps as well as swipes**
  so both feel the same. Off-chain pages keep the plain fade. At either end of the chain the content
  gives a short `.edge-nudge` shake instead of moving. All of it is disabled under
  `prefers-reduced-motion`.

## 6. Rules of thumb

- Keep **calories + protein** the visual headline in Food; carbs/fat are secondary.
- Reach for tokens, never raw hex — the whole recolor works because everything resolves through
  `var()` / `cssv()`.
- Small colored text → `-ink` variant. Fills, bars, rings → base token.
- Any change that alters the look → update this file (per the working agreement).

## 7. Known tradeoff

White text on the neon gradient buttons is ~3.0:1 at the dark stop (~1.6:1 at the light stop),
below the 4.5:1 AA threshold. This is a **deliberate, user-approved** choice to keep the "lightest
neon green" identity. If it ever needs fixing, darken the gradient to roughly `#2ec46f → #1a9450`,
which stays fresh but reaches acceptable contrast.
