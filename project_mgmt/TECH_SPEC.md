# SheRules — Technical Specification

**Product name:** SheRules
**Owner:** OlliesWorld
**Date:** October 15, 2026
**Version:** 1.0 — matches the code on `main` (commit `32d9b4b`)

---

## 1. System Architecture Overview

```
                        INGESTION (local, run by hand)
 data/*.pdf ──► pdf.ts (unpdf, text per page) ──► parser (per book layout) ──► chunks
                                                                       │
                       Gemini gemini-embedding-2 (768 dims) ◄──────────┘
                                         │
                                         ▼
                              Turso (libSQL) `chunks` table


                        QUESTION FLOW (Vercel, per request)
 Browser ──POST ?/ask──► SvelteKit form action
                           │ 1. validate (3–500 chars)
                           │ 2. daily limits (Upstash Redis)  
                           │ 3. embed question (Gemini)
                           │ 4. top 5 chunks: WHERE sport, league, embedding_model
                           │    ORDER BY cosine distance (Turso)
                           │ 5. answer from excerpts only, JSON out (gemini-3.5-flash-lite)
                           │ 6. keep only citations that match retrieved chunks
                           │ 7. log question + result (Upstash Redis)
                           ▼
                        answer + rule cards (links to official PDF #page=N)
```

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | SvelteKit 3 (Svelte 5 runes), TypeScript | Load functions + form actions (stable APIs, not remote functions) |
| Styling | Tailwind CSS 4, shadcn-svelte (Button, Input) | Design tokens in `src/routes/layout.css` |
| Themes | mode-watcher | Light/dark, follows system, no flash on load |
| Icons | @lucide/svelte + custom SVG (basketball, whistle) | |
| Database | Turso (libSQL) with native vectors (`F32_BLOB`) | `file:local.db` for local dev |
| Embeddings | Gemini `gemini-embedding-2`, 768 dimensions | Task prefixes instead of `task_type` |
| Answers | Gemini `gemini-3.5-flash-lite` | JSON output via `responseJsonSchema` |
| PDF text | unpdf (pdf.js) | One string per page |
| Question log | Upstash Redis (`@upstash/redis`) | Same pattern as SheKnows |
| Hosting | Vercel (`@sveltejs/adapter-vercel`) | Serverless functions |
| Scripts | tsx | `npm run ingest`, `ask`, `logs`, `db:check` |

---

## 3. Data Model

### 3.1 `chunks` (Turso)

```sql
CREATE TABLE chunks (
  id              TEXT PRIMARY KEY,   -- "<source_id>:<slug of rule_ref>"
  sport           TEXT NOT NULL,      -- "volleyball", "basketball" (URL slug)
  league          TEXT NOT NULL,      -- "ncaa", "pro", "wnba" (URL slug)
  season          TEXT NOT NULL,      -- "2026-27", "2025-27", "2026"
  source_id       TEXT NOT NULL,      -- key into src/lib/ingest/sources.ts
  division        TEXT NOT NULL,      -- "all" (NCAA marks divisions inline)
  rule_ref        TEXT NOT NULL,      -- in the book's own style: "Rule 9.2.3", "Rule 1-2.3", "Rule 12B, Section IV", "Case 12.10"
  type            TEXT NOT NULL,      -- "rule" | "interpretation"
  heading_path    TEXT NOT NULL,      -- "Rule 11 – Game Interruptions > 11.3 SUBSTITUTIONS > 11.3.2 Limitations"
  text            TEXT NOT NULL,      -- the rule text only
  page            INTEGER NOT NULL,   -- PDF file page (what #page=N uses)
  embedding_model TEXT NOT NULL,      -- "gemini-embedding-2@768"
  embedding       F32_BLOB(768) NOT NULL
);
CREATE INDEX chunks_sport_league ON chunks (sport, league);
CREATE INDEX chunks_source ON chunks (source_id);
```

No vector index: search filters by sport and league first, then compares every remaining chunk. That is exact and fast at this size (≤ ~600 chunks per league).

Source names and URLs are **not** stored; they come from `sources.ts` by `source_id`.

### 3.2 Daily limits (Upstash Redis)

Counters, one key per visitor per day plus one for everyone:
```
sherules:asks:<UTC date>:<HMAC-SHA-256(RATE_LIMIT_SECRET, "<date>:<IP>")>   per visitor (limit 5)
sherules:asks:<UTC date>:all                                                site-wide (limit 500)
```
`INCR` is atomic, so concurrent requests can't both slip under a limit; a rejected question is decremented back. Every key expires after 2 days. The app no longer writes to Turso.

### 3.3 Question log (Upstash Redis)

List `sherules:logs`, newest first, trimmed to 1,000 entries:
```json
{ "question": "...", "sport": "basketball", "league": "ncaa",
  "result": "answered | not_found | rate_limited | at_capacity | error",
  "citations": ["Rule 4-12.1"], "retrieved": [{ "ruleRef": "Rule 4-12.1", "distance": 0.223 }],
  "ms": 2140, "timestamp": "2026-10-12T21:04:11.000Z" }
```
No IP or visitor details.

---

## 4. Ingestion Pipeline

### 4.1 Sources (`src/lib/ingest/sources.ts`)

Each source declares: `id`, display `name`, official `url`, local `file` (in gitignored `data/`), `sport`, `league`, `season`, `division`, `parser`, page `ranges` to ingest (each typed `rule` or `interpretation`), labeled `skipped` ranges, and optional `skipPages`.

| Source id | Parser | Pages ingested | Chunks |
|---|---|---|---|
| `ncaa-volleyball-2026-27` | `ncaa-rulebook` | 16–81 rules, 102–131 interpretations | 222 + 150 |
| `ncaa-basketball-2026-27` | `ncaa-sections` | 23–118 | 612 |
| `usav-indoor-rules-2025-27` | `fivb-rules` | 20–78 rules, 103–104 definitions | 135 |
| `usav-casebook-2025-27` | `usav-casebook` | 9–160 | 476 |
| `wnba-rules-2026` | `nba-rules` | 12–81 rules, 81–90 comments | 123 + 18 |
| `ncaa-soccer-2026-27` | `ncaa-articles` | 13–89 | 320 |
| `ifab-laws-2026-27` (NWSL) | `ifab-laws` | 12–16, 20–21 protocols; 23–76 Laws 1–17; 77–81 VAR protocol | 103 |
| `nwsl-competition-rules-2026` | `caps-headings` | 1–17 | 33 |
| `world-rugby-laws-2026` (rugby, all leagues) | `world-rugby-laws` | 20–27 definitions, 30–122 Laws 1–21, 127–135 sevens variations | 223 |
| `ncaa-hockey-2026-28` | `ncaa-hockey` | 14–126 rules; 133–135, 142–145 appendices | 312 |
| `ncaa-womens-hockey-interpretations-2026-1` | `memo` | 1–2 | 4 |
| `ncaa-womens-hockey-experimental-2026-27` | `memo` | 1 | 1 |
| `pwhl-rules-2025-26` | `pwhl-rules` | 18–159 | 525 |
| `usah-rules-casebook-2025-29` | `usah-rules` | 35–376 rules and casebook, 409–416 glossary | 128 + 652 |

### 4.2 Parsers (one per rulebook layout)

| Parser | Layout | Chunk unit |
|---|---|---|
| `chunk-ncaa-rulebook.ts` | `RULE 1` / `1.2 SECTION` / `1.2.3 Article` (numbered headings) | Article; tables and section intros as their own chunks; interpretation `SITUATION n:` |
| `chunk-ncaa-sections.ts` | `RULE 1` / `SECTION 2.` / `Art. 3.` (labeled headings) | Article; section-level `PENALTY (…):` blocks as their own chunks; section lead-ins carried into heading path |
| `chunk-fivb-rules.ts` | `RULE 1.` / `1.2 Sub-rule` / `1.2.1:` points, `USAV …:` modifications | Sub-rule (keeps FIVB text with USA Volleyball's changes); definitions glossary one per term |
| `chunk-usav-casebook.ts` | Case number + situation / `Ruling:` / `Reference:` | Case |
| `chunk-nba-rules.ts` | `RULE NO. 1—` / `Section I—` / `a.` items; Rule 12 parts A/B | Section; sections > 600 words split at lettered items into ~500-word pieces ("Rule 13, Section II, a–c"); Comments on the Rules one per topic |
| `chunk-ncaa-articles.ts` | `RULE 1` / `1.1 SECTION` / untitled `1�1�1` articles | Article ("Rule 1.1.4"); list sections grouped with their lead-in ("Rule 12.7.1–12.7.4"); offside diagrams one each |
| `chunk-ifab-laws.ts` | Law from page footer / `1. Section` / sentence-case subheadings | Section ("Law 12.2"), long ones split at subheadings; titled ranges for protocols and VAR |
| `chunk-caps-headings.ts` | `ALL-CAPS HEADINGS:` with `A.` lettered parts | Heading; long policies split at lettered parts and titled items |
| `chunk-world-rugby-laws.ts` | Law from page footer / caps subheadings / `5.` numbered laws | Subheading group ("Law 14.5–14.11"); definitions one per term; sevens variations one per Law. Restores the periods the PDF's text layer drops |
| `chunk-ncaa-hockey.ts` | `RULE 94 - TITLE` / `94.1 Title - text` | Article ("Rule 94.1"), long ones split at items or sentences; titled appendices |
| `chunk-memo.ts` | Numbered rulings with Situation / Ruling; one-topic memos | Ruling ("Interpretation 2 – …"); a one-topic memo keeps its heading and rule, without the process text |
| `chunk-pwhl-rules.ts` | `Rule 24 Title` / `24.3 Title` (NHL style) | Article ("Rule 24.3"), long ones split at paragraphs |
| `chunk-usah-rules.ts` | `Rule 401 Title` / `(a)` items; each section's casebook follows its rules | Rule ("Rule 401", long ones "Rule 604(c)–(f)"); case ("Rule 401, Situation 7"); glossary one per term |

How to add a sport, league or source, including when to write a new parser: [ADDING_A_SPORT.md](ADDING_A_SPORT.md).

Shared helpers (`pdf-lines.ts`): page-furniture removal, `�`→`.` fix (NCAA fonts), line rejoining that keeps list items on their own lines, hyphen rejoining, title case.

Every parser reports sequence gaps (missing rule/section/article numbers) and unparseable pages in the dry-run summary.

### 4.3 Embedding and storage (`scripts/ingest.ts`)

```
npm run ingest -- <source-id> --dry-run   # parse + summary only
npm run ingest -- <source-id>             # parse, embed, store
```
1. Parse → check rule refs are unique within the source → print summary
2. Connect to the database and create tables **before** embedding (fail fast)
3. Embed in batches of 20 with a 1 s pause; retry 429/5xx with exponential backoff (max 5)
4. Embedding input: `title: <heading_path> | text: <text>`
5. Replace all rows for the source in one transaction (re-runs never duplicate)

Each input is sent as its own `Content` object: a plain array of strings is merged into one Content by the SDK and returns a single combined embedding.

---

## 5. Question Flow (`src/lib/server/`)

| Step | File | Detail |
|---|---|---|
| Validate | `routes/[sport]/[league]/+page.server.ts` | 3–500 characters; validation failures don't count toward the limit |
| Daily limits | `rate-limit.ts` | 5 per visitor and 500 site-wide per UTC day (Redis counters, HMAC visitor ids); if Redis or `RATE_LIMIT_SECRET` is missing in production, questions are refused; disabled when `dev` |
| Embed question | `embed.ts` | `task: search result | query: <question>` |
| Retrieve | `search.ts` | Top 5 by `vector_distance_cos`, filtered by sport, league, embedding model |
| Answer | `answer.ts` | System prompt: excerpts only, cite refs in brackets, say "I can't find that in the rulebook", call out division differences. JSON `{found, answer, citations}` |
| Citation check | `answer.ts` | Normalize refs; keep only refs among retrieved chunks; no valid citation → not found |
| Assemble | `rag.ts` | Citations get source name, `url#page=N`, and rule text |
| Log | `log.ts` | Redis entry; never throws |
| Refund | `rate-limit.ts` | On Gemini error, the question doesn't count |

`askRulebook(deps, …)` takes its clients as an argument, so the app (`clients.ts`, using `$app/env/private`) and scripts/evals (using `process.env`) can each supply their own.

---

## 6. Routes

```
/                         Sports with data
/[sport]                  Leagues with data for that sport (404 if none)
/[sport]/[league]         Banner, question form (action ?/ask), answer, rule cards (404 if no data)
/dev/colors               Sport color comparison — dev only, 404 in production
```

Layout: header (sport ball or whistle mark, theme toggle), breadcrumb trail, glow and drifting ball behind the hero (ball only on sport pages).

---

## 7. Configuration

### 7.1 Environment variables (`src/env.ts`)

| Variable | Required | Used by |
|---|---|---|
| `GEMINI_API_KEY` | Yes | App, ingest, ask |
| `TURSO_DATABASE_URL` | Yes | App, ingest, ask, db:check |
| `TURSO_AUTH_TOKEN` | For Turso Cloud | Same |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production | Question log and daily limits (Vercel's Redis integration names) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Alternative | Same, with Upstash's own names |
| `RATE_LIMIT_SECRET` | Production | HMAC key for visitor ids (`openssl rand -hex 32`) |

Production can use a **read-only** Turso token; ingest needs full access. SvelteKit validates required variables at build and start. Server code reads them from `$app/env/private`, which can't be bundled for the browser. Scripts read `process.env` or a gitignored `.env`.

### 7.2 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server (no daily limit) |
| `npm run ingest -- <id> [--dry-run]` | Parse/embed/store a source |
| `npm run snapshot -- save\|compare [id...]` | Parser regression check: save every source's parser output, then compare after a change (no API calls) |
| `npm run ask -- <sport> <league> "<q>"` | Ask from the terminal; prints retrieved chunks with distances |
| `npm run eval [-- --page <sport/league> \| --id <id>]` | Run the labeled questions in `evals/questions.json`; see [EVALS.md](EVALS.md) |
| `npm run logs [-- N]` | Newest N logged questions from Redis |
| `npm run db:check` | Step-by-step Turso connection and vector check |
| `npx tsx scripts/dump-pdf.ts <pdf>` | Print a PDF's extracted text by page (for writing parsers) |

---

## 8. Performance Targets

| Metric | Target | Notes |
|---|---|---|
| Answer time | < 5 s median | Two Gemini calls + one DB query |
| Retrieval | < 200 ms | Exact scan of ≤ ~600 chunks |
| Page load | < 500 ms | Catalog queries; cache candidates in SECURITY_PLAN M5 |

---

## 9. Cost and Limits

| Service | Usage | Free tier |
|---|---|---|
| Turso | ~1,736 chunks ≈ 8 MB; ~400–600 rows read per question, up to ~1,600 per page view | 5 GB storage, 500M rows read, 10M written per month |
| Upstash Redis | ≤ 1,000 entries ≈ 1 MB; 2 commands per question | 256 MB, 500k commands per month |
| Gemini | 1 embedding + 1 answer per question; one-time embeddings per ingest | Usage-based — set a budget alert |
| Vercel | Hobby plan | |

---

## 10. Security & Privacy

See **SECURITY_PLAN.md** for the full review, open items and launch checklist. In short: no secrets or rulebook PDFs in git; server-only code isolated; strict Content Security Policy with nonces plus security headers (`vite.config.ts`, `src/hooks.server.ts`); CSRF protection; daily limits by HMAC-hashed IP in Redis with a site-wide cap; read-only database access from the app; home and sport pages edge-cached; no visitor details logged.

---

## 11. Monitoring & Observability

| What | Where |
|---|---|
| Server errors and dropped-citation warnings | Vercel → Logs |
| Questions, results, retrieval distances, timing | `npm run logs` / Upstash Data Browser |
| Database usage | Turso dashboard |
| Gemini spend | Google Cloud billing (budget alert) |

---

## 12. Future Technical Considerations

- **Evals:** built as `npm run eval` (no promptfoo; see [EVALS.md](EVALS.md)). Next: a model-graded correctness check if word matching proves too blunt
- **Relevance cutoff:** skip the answer call when the best distance is clearly unrelated (tune from evals)
- **Sources table:** move per-source metadata out of `chunks` to cut page-load row reads
- **Checksums:** detect when an official PDF URL now serves a new edition
- **Exact-quote citations:** have the model return the sentence it relied on (verified against the chunk)
