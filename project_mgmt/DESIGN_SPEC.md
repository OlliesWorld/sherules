# SheRules — Design Specification

**Status:** Built. This documents the design as implemented (from the Lovable "SheRules" export, plus approved changes).
**Source of truth for values:** `src/routes/layout.css`

---

## Product Overview

SheRules answers rules questions about women's sports in plain language, straight from the official rulebook, with the rule cited and linked. The audience is fans on their phones mid-game as much as coaches at a desk, so the design is mobile-first, calm and trustworthy, with one confident accent color per sport.

---

## Design Direction

- **Personality:** confident, warm, a little sporty. The headline voice is conversational ("Saw a call you didn't get?"); answers are plain and direct.
- **Trust first:** every answer shows the actual rule, its number, and a link to the official PDF page.
- **One accent per sport:** layout, type and spacing never change between sports, only the accent.
- **Motion is quiet:** fade-and-rise on load, slow drifting ball, gentle hover lift. All disabled under `prefers-reduced-motion`.

### Typography

| Role | Font | Usage |
|---|---|---|
| Display | Archivo 700–900 | Hero headline, page titles, sport names |
| Body / UI | Sora 400–800 | Everything else |
| Rule numbers | JetBrains Mono 400/700 | Big rule number on rule cards |

### Color tokens

shadcn token names, so shadcn components pick them up.

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(98.5% 0.006 95)` warm off-white | `oklch(16% 0.025 255)` deep navy |
| `--foreground` | `oklch(20% 0.03 255)` navy | `oklch(96% 0.008 95)` warm white |
| `--card` | white | `oklch(20% 0.03 255)` |
| `--muted` / `--secondary` | `oklch(95.5% 0.01 255)` | `oklch(24% 0.03 255)` |
| `--muted-foreground` | `oklch(47% 0.02 255)` | `oklch(72% 0.02 255)` |
| `--border` | `oklch(90% 0.012 255)` | `oklch(30% 0.03 255)` |
| `--destructive` | `oklch(55% 0.19 28)` | `oklch(70% 0.17 28)` |

### Sport accents

Each sport sets chroma and hue; each theme sets lightness, so every sport works in both themes:

```
--sport = oklch(var(--sport-l) var(--sport-c) var(--sport-h))
light: --sport-l 50%    dark: --sport-l 72%
```

| Sport | Chroma | Hue | Light | Dark |
|---|---|---|---|---|
| Volleyball | 0.12 | 190 (teal) | `oklch(50% .12 190)` | `oklch(72% .12 190)` |
| Basketball | 0.15 | 55 (orange) | `oklch(50% .15 55)` | `oklch(72% .15 55)` |

Derived: `--sport-soft` (15% alpha, chips/badges/hover), `--shadow-sport`, `--sport-foreground` (white in light, navy in dark).

**Contrast (checked):** body, muted text, accents and white-on-accent are all ≥ 4.5:1 (WCAG AA) on their backgrounds in both themes. Rule numbers on tinted rule cards: 4.87:1 at rest, ~4.6:1 on hover.

### Rule card background

Light: sport color mixed into white, 7% at rest, 11% on hover (pale mint for volleyball, pale peach for basketball). Dark: plain muted panel, sport tint on hover.

### Iconography

- **Sport balls:** Lucide `volleyball`; custom line basketball. 1.5 stroke on the shared grid; `currentColor`.
- **Whistle mark:** original drawing (`WhistleMark.svelte`), used as the logo off sport pages.
- No league logos, trademarks or photos.

---

## Screens

### Screen 1: Home (`/`)
- Header: whistle mark + "SheRules", theme toggle
- Hero over a soft glow (no ball): badge "Women's sports, decoded", headline "Saw a call you **didn't get?**", subhead
- "Pick a sport" grid: one tile per sport **with data** (ball icon in its accent + name). No "coming soon" tiles.

### Screen 2: Sport (`/volleyball`)
- Header shows the sport's ball; glow plus large drifting ball behind the hero
- Breadcrumb pill: Home › Volleyball
- Title, then "Choose a league" cards: league name, "College · 2026-27 rulebook" / "Professional · 2025-27 rulebook", arrow

### Screen 3: League / Ask (`/volleyball/ncaa`)
- Breadcrumb: Home › Volleyball › NCAA
- Title "NCAA Volleyball" + banner "Answers from the 2026-27 NCAA rulebook" (or the borrowed rulebook's name, plus a note, for Pro)
- Rounded input + "Ask" button in the sport accent; "N of 5 free questions left today" under it

**States in the answer area:**

| State | Content |
|---|---|
| Empty | "Try asking" + example question chips |
| Loading | Sport ball nudging + "Checking the rulebook…" + three pulsing accent lines |
| Answer | "You asked" + question; answer paragraphs; "From the rulebook · N rules"; rule cards |
| Not found | Muted card: "I can't find that in the rulebook." + tips + example chips |
| Error | Destructive-border card: "Something went wrong on our end." + Try again (question kept) |
| Limit reached | Muted card: "That's your 5 questions for today. Come back tomorrow for more."; input disabled |
| Site at capacity | Muted card: "We've answered all the questions we can for today." (site-wide daily cap) |

**Rule card:** big monospace rule number in the accent (smaller for long refs like "13, Situation 1"), italic rule text clamped to 4 lines, divider, "Source name, p. N" + "Open source →". The whole card links to the PDF page.

**Disclaimer** (small muted text under the rule cards): names the rulebook quoted, says the text is for reference only, that SheRules is not affiliated with or endorsed by the publisher, and that the official rulebook is the final word.

A "Show the N excerpts this answer was based on" disclosure (muted, at the bottom) shows retrieval distances. It is a tuning aid; see SECURITY_PLAN C4 for the launch decision.

### Screen 4: 404 / error
Large status number, message, "Go home" button. Whistle mark, no sport accent.

### Dev only: `/dev/colors`
Both sports side by side (input, chips, badge, rule cards, tile, loading lines) for comparing accents in each theme. Returns 404 in production.

---

## Interaction Notes

1. Example chips fill the question and submit; "Try again" resubmits the kept question.
2. The form works without JavaScript (plain POST); with JavaScript it submits without reloading.
3. Theme toggle: sun/moon; the first visit follows the device setting; the choice is remembered.
4. Breadcrumb pill uses a frosted background so it stays readable over the glow.

---

## Accessibility

- AA contrast for all text and accents in both themes (see above)
- Visible focus ring in the sport accent on every interactive element
- Answer area is `aria-live="polite"`; loading is `role="status"`; errors use `role="alert"`
- Breadcrumb is a labeled `nav` with `aria-current="page"`
- Decorative icons are `aria-hidden`; rule card links have descriptive `aria-label`s
- `prefers-reduced-motion` disables drifting, pulsing and hover lift

---

## Key Design Priorities

1. **The answer is the hero:** short plain answer first, then the evidence.
2. **Show the source every time:** rule number, rule text and the official page link.
3. **Honest "can't find":** the not-found state is friendly and helpful, never a dead end.
4. **Phone first:** single column, big tap targets (≥ 44px), no horizontal scroll.

---

## What NOT to Do

- No league logos, team marks, player photos or stock images
- No "coming soon" sports or leagues; show only what has data
- No answer without a citation
- Don't change layout between sports; only the accent changes
- Don't add a ball to the home page hero (it implies one sport)
