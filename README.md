# SheRules

Ask a rules question about a women's sport and get a plain-language answer taken only from the official rulebook, with the rule cited and a link to the exact page of the official PDF.

Currently covers NCAA volleyball, pro volleyball (USA Volleyball rules), NCAA basketball and the WNBA.

**Stack:** SvelteKit 3 on Vercel · Turso (libSQL with vector search) · Gemini embeddings and answers · Upstash Redis · Tailwind + shadcn-svelte

More detail: [`project_mgmt/`](project_mgmt/) — PRD, technical spec, design spec, build plan.

## Setup

Needs Node 22 or 24.

```sh
npm install
cp .env.example .env   # then fill in the values; .env is gitignored
npm run dev
```

| Variable | Needed for |
|---|---|
| `GEMINI_API_KEY` | Everything (from https://aistudio.google.com/apikey) |
| `TURSO_DATABASE_URL` | Everything (`file:local.db` locally, `libsql://…` for Turso Cloud) |
| `TURSO_AUTH_TOKEN` | Turso Cloud |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Question log and daily limits (required in production) |
| `RATE_LIMIT_SECRET` | Daily limits (required in production; `openssl rand -hex 32`) |

The daily question limits are off in local development.

## Adding a rulebook

Rulebook PDFs are copyrighted, so they live in `data/`, which is gitignored and never committed.

1. Download the official PDF into `data/<sport>/`
2. Look at its text: `npx tsx scripts/dump-pdf.ts data/<sport>/<file>.pdf > dump.txt`
3. Add an entry to `src/lib/ingest/sources.ts` (and a parser in `src/lib/ingest/` if the layout is new)
4. Check the parse: `npm run ingest -- <source-id> --dry-run`
5. Embed and store: `npm run ingest -- <source-id>`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run check` | Type check |
| `npm run ingest -- <id> [--dry-run]` | Parse, embed and store a rulebook |
| `npm run ask -- <sport> <league> "<question>"` | Ask from the terminal; shows retrieved rules and distances |
| `npm run logs [-- 50]` | Recent questions from the Redis log |
| `npm run db:check` | Check the Turso connection and vector support |

## Deploying

Push to `main`; Vercel builds and deploys. Set the environment variables above in Vercel (production can use a read-only Turso token). See `project_mgmt/SECURITY_PLAN.md` for the launch checklist.
