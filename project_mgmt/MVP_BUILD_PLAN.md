# SheRules — Build Plan

**Owner:** OlliesWorld
**Date:** October 15, 2026
**Version:** 2.0 — MVP built; this plan now tracks launch and post-launch work

---

## Overview

The MVP was built iteratively, one reviewable phase at a time, each ending in something that works end to end. Every phase below lists what was delivered and where it lives. Remaining work starts at **Sprint 5**; adding sports is planned in **Sport Expansion Plan**.

### Foundation
SvelteKit 3 + TypeScript on Vercel, Turso for storage and vector search, Gemini for embeddings and answers, Upstash Redis for the question log. See TECH_SPEC.md.

---

## Sprint 1: Ingestion ✅ (`fcc53e4`)

### Delivered
- PDF text extraction per page; chunking by the rulebook's own structure
- Table of contents and index skipped; interpretations tagged separately
- Embedding + storage with a dry-run summary (chunk counts, samples, unparseable pages)

### Key Files
`scripts/ingest.ts`, `src/lib/ingest/*`, `src/lib/server/db.ts`, `src/lib/server/embed.ts`

### Demoable Output
NCAA volleyball: 372 chunks in Turso.

---

## Sprint 2: Search, Answers, UI ✅ (`7c3290e`)

### Delivered
- Retrieval (top 5, cosine, filtered by sport/league/model), grounded answers in JSON, citation check
- Routes `/`, `/[sport]`, `/[sport]/[league]` showing only data that exists
- Design from the Lovable export (Tailwind + shadcn-svelte), light/dark themes, sport accents, breadcrumbs, whistle mark
- `npm run ask` for terminal testing; `/dev/colors` (dev only)

### Demoable Output
Ask NCAA volleyball questions on Vercel and get cited answers linking to the PDF page.

---

## Sprint 3: More Leagues ✅ (`1b9673a`, `82f22ed`, `32d9b4b`)

### Delivered
- NCAA women's basketball (`ncaa-sections` parser)
- Pro volleyball from USA Volleyball's rules and casebook (`fivb-rules`, `usav-casebook`), with a banner note about LOVB/MLV
- WNBA 2026 (`nba-rules`), with long sections split at lettered items
- Shared parser helpers; each new parser verified not to change earlier sources' output

### Demoable Output
Volleyball: NCAA + Pro. Basketball: NCAA + WNBA.

---

## Sprint 4: Guardrails ✅ (`37150cc`)

### Delivered
- Questions per visitor per day (hashed IP + date, Turso `ask_usage`), refunded on errors, off in dev (now 5)
- Question log in Upstash Redis (`sherules:logs`), `npm run logs`
- Favicon fix that restored client JavaScript (chips, theme toggle, loading state)

---

## Sprint 5: Launch Hardening ⏳ (next)

See **SECURITY_PLAN.md** for details and rationale.

### Tasks
- [x] Disclaimer under quoted rule text (H1 option 1); further text reduction still to decide
- [x] 5 questions per visitor per day + global cap of 500/day (H2)
- [x] Visitor ids hashed with a secret, limits moved to Redis with auto-expiry (H3, M2)
- [x] Security headers + CSP (M1), privacy note (M3), prompt guard (M4), edge caching (M5), Dependabot (L1)
- [x] Cleanup C1–C4
- [ ] Account settings: SECURITY_PLAN §5 (secret, read-only token, budget alert, API key restriction)

### Demoable Output
Production site passes the launch checklist in SECURITY_PLAN §5.

---

## Sprint 6: Evaluations (planned)

### Tasks
- Labeled question set per league (20–40 each): question, expected rule refs, expected answer facts, "should be not-found" cases
- promptfoo config calling `askRulebook()` directly (deps from `process.env`)
- Metrics: expected ref in top 5 (retrieval), answer graded correct, false not-found rate
- Use results to tune top-k, a distance cutoff, and the answer prompt; compare `gemini-3.5-flash-lite` vs `gemini-3.8-flash`

### Demoable Output
A report showing retrieval and answer accuracy per league, re-runnable after any change.

---

## Sprint 7: More Sources (planned)

### Candidates
- NCAA women's basketball 2026-27 Case Book (interpretations)
- NCAA volleyball: D1 and D2/D3 rules-changes documents (`division` column), Challenge Review System manual, court specifications
- Basketball uniform guidelines (poster layout)

### Process per source
Download to `data/` → `dump-pdf` → structure report → parser (new or existing) → dry run → regression check of other sources → ingest → commit.

---

## Sport Expansion Plan (Sprints 8+)

Goal: grow from 2 sports to 8+, one sport at a time, without changing the app's structure. The routes, search and UI already work for any sport; adding one is mostly a new source, a parser if the layout is new, and a few display settings.

### Prioritization

Each candidate is scored on:

| Factor | Why it matters |
|---|---|
| Public official rulebook | No rulebook, no grounded answers. Pro leagues often don't publish one |
| Parser reuse | NCAA books share layouts; a reused parser is days of work saved |
| Audience and season timing | Launch a sport before or early in its season, when questions peak |
| Licensing | Some publishers state reuse terms; check before ingesting (see SECURITY_PLAN H1) |
| Men's/women's book | NCAA soccer and ice hockey books cover both; answers must pick the women's rule when they differ |

### Candidate sources (checked October 2026)

| Sport | League | Source | Status |
|---|---|---|---|
| Softball | NCAA | NCAA Softball Rules Book 2026-27 + 2026 and 2027 Case Book | Public on NCAA playing rules page |
| Softball | Pro | AUSL publishes only a format overview, not a rulebook | Use USA Softball or WBSC rules with a "may differ" note (like Pro volleyball), or wait |
| Soccer | NCAA | NCAA Soccer Rules Book 2026 and 2027 (men's and women's) | Public on NCAA playing rules page |
| Soccer | Pro (NWSL) | IFAB Laws of the Game 2026/27 for play; NWSL 2026 Competition Rules & Regulations for league matters | Both public; confirm NWSL plays IFAB Laws unmodified |
| Lacrosse | NCAA | NCAA Women's Lacrosse Rules Book 2026-27 | Public on NCAA playing rules page |
| Lacrosse | Other | USA Lacrosse women's rules (has a 2026 rules comparison) | Public; check licensing |
| Field hockey | NCAA | NCAA Field Hockey Rules Book + 2026 Division I rule modification | Public on NCAA playing rules page |
| Rugby | All levels | World Rugby Laws of the Game 2026 (incl. July 2026 law updates) | Public PDF from World Rugby |
| Rugby | Pro (Women's Elite Rugby) | No published rulebook found | Use World Rugby Laws with a "may differ" note |
| Ice hockey | Pro (PWHL) | PWHL Official Rules 2025-26 | Public on the PWHL rules page |
| Ice hockey | NCAA | NCAA Ice Hockey Rules Book (men's and women's) | Not confirmed in search; verify on ncaa.org |
| Later | — | Beach volleyball (NCAA), water polo, others | Not yet researched |

### Waves

**Wave 1: NCAA women's sports (Sprints 8–9).** Softball, soccer, lacrosse, field hockey. Same publisher, likely similar layouts, so the existing `ncaa-sections` / `ncaa-rulebook` parsers probably fit with small changes. Softball's case book adds interpretations right away. Order by season: softball and lacrosse (spring) before soccer and field hockey (fall).

**Wave 2: International law books (Sprint 10).** Rugby (World Rugby Laws) and pro soccer (IFAB Laws + NWSL rules). Both use a "Law 1–N" layout, so one new `laws` parser should cover both. Rugby launches with an "All levels" league; pro soccer as NWSL.

**Wave 3: Ice hockey (Sprint 11).** PWHL rulebook first (published), then NCAA if its book is confirmed.

**Wave 4: Pro leagues without rulebooks.** AUSL softball, Women's Elite Rugby and others, using governing-body rules plus a visible "may differ" note, as Pro volleyball does today. Revisit if leagues publish their own.

### Checklist per sport

1. **Research:** official source URL(s), season, publisher's reuse terms, men's/women's coverage
2. **Ingest:** download to `data/<sport>/` → `dump-pdf` → structure report → parser (reuse or new) → dry run → regression check of existing sources → ingest
3. **Display settings:**
   - `src/lib/labels.ts`: sport name, league name/level, "Try asking" examples (make these per league; SECURITY_PLAN C6)
   - `src/routes/layout.css`: a `[data-sport='<slug>']` block with `--sport-c` / `--sport-h`
   - `SportIcon.svelte`: an original line-drawn ball or stick (no league marks)
   - `BORROWED_RULEBOOKS` note if the page uses another body's rules
4. **Check:** contrast in both themes (≥ 4.5:1) and side by side on `/dev/colors`; a 20–40 question eval set; spot-check answers that differ between men's and women's rules
5. **Ship:** commit, push, update PRD coverage table and TECH_SPEC sources table

### Proposed accent hues

Hues are spaced at least 30° apart and away from the error red (hue 28). Lightness comes from the theme, as for volleyball and basketball. Values are proposals: confirm each on `/dev/colors` and with the contrast check before shipping.

| Sport | Hue | Color |
|---|---|---|
| Volleyball (live) | 190 | Teal |
| Basketball (live) | 55 | Orange |
| Rugby | 90 | Ochre |
| Soccer | 145 | Pitch green |
| Ice hockey | 245 | Ice blue |
| Softball | 285 | Violet |
| Field hockey | 315 | Berry |
| Lacrosse | 355 | Crimson |

### What changes as the catalog grows

| At about | Change |
|---|---|
| 5+ sports | Per-league example questions (C6); home grid stays 2-up phone / 3-up desktop |
| 10+ leagues | A `sources` table so catalog pages don't scan `chunks` (SECURITY_PLAN M5) |
| Men's/women's books | Prompt line: "If the excerpt gives different rules for men and women, answer with the women's rule" |
| Each season | Re-ingest changed books; track official URL checksums (Risk Checkpoints) |
| More traffic | Revisit `GLOBAL_ASKS_PER_DAY`; costs scale with questions, not sports |

---

## Deferred Features (Post-Launch)

| Feature | Why deferred |
|---|---|
| Exact-quote citations | Needs eval coverage first; also reduces displayed rulebook text |
| Follow-up questions | Retrieval needs the original question as context |
| Streaming answers | Answers are short; latency acceptable |
| Accounts, paid tiers | Wait for usage data |
| Season checksums | Matters at the next season rollover |

---

## Risk Checkpoints

| Checkpoint | Question | If no |
|---|---|---|
| Before launch | Is the rulebook-text decision made and the disclaimer live? | Don't launch publicly |
| Before launch | Is there a global spend cap and budget alert? | Keep Vercel Deployment Protection on |
| After eval v1 | Is retrieval ≥ 90% per league? | Revisit chunking for that league before adding sources |
| Each season | Did any official URL change edition? | Re-ingest that source; update `season` |
