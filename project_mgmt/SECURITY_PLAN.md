# SheRules — Security Plan & Pre-Launch Cleanup

**Owner:** OlliesWorld
**Date:** October 15, 2026
**Reviewed:** code on `main`, git history, dependencies, Vercel request handling
**Status:** code items done; remaining items are account settings (§5)

---

## 1. What We're Protecting

| Asset | Why it matters |
|---|---|
| Gemini API key and spend | Every question costs two Gemini calls; abuse becomes a bill |
| Turso database (rulebook chunks) | Tampering would change the answers |
| Turso, Redis and Gemini credentials | Full access to the above |
| Visitor privacy | IP-derived ids and typed questions |
| Trust in answers | Wrong or invented rules hurt credibility |
| Rights holders' content | NCAA, USA Volleyball and WNBA rulebooks are copyrighted |

**Threats considered:** cost abuse (scripted questions), credential leaks, prompt injection, XSS, CSRF, clickjacking, spoofed client IPs, scraping, data exposure in logs, copyright claims.

---

## 2. Controls in Place

| Area | Control | Where |
|---|---|---|
| Secrets | None ever committed (git history checked); `.env` gitignored; keys only in `$app/env/private` / `src/lib/server/`, which can't be bundled for the browser | `.gitignore`, `src/env.ts` |
| Rulebook files | PDFs and local databases never committed; `data/` gitignored | `.gitignore` |
| XSS | No `{@html}`; Svelte escapes model output and rule text; strict CSP: scripts only from this site with a per-request nonce | `vite.config.ts` (`csp`) |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `vite.config.ts`, `src/hooks.server.ts` |
| Other headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, location, payment off; microphone for this site only, for voice) | `src/hooks.server.ts` |
| CSRF | SvelteKit 3 always checks the origin on form posts | framework |
| AI spend | Typed questions: 5 per visitor per day, 500 site-wide. Voice: 3 conversations per visitor per day, 100 site-wide, 5 minutes each (ended by the browser). If the limits can't run in production, questions and voice are refused rather than left unlimited | `src/lib/server/rate-limit.ts`, league `+page.server.ts`, `api/voice/token` |
| Client IP | Vercel overwrites `X-Forwarded-For` and doesn't forward client-supplied values | Vercel |
| Visitor ids | HMAC-SHA-256 of date + IP with a secret (`RATE_LIMIT_SECRET`): can't be reversed by trying every IP; not linkable across days | `rate-limit.ts` |
| Retention | Limit counters in Redis expire after 2 days; question log capped at 1,000 entries, no IP or visitor details | `rate-limit.ts`, `log.ts` |
| Database access | The app only reads Turso (limits moved to Redis), so production can use a read-only token | `clients.ts` |
| Invented citations | Citations not among retrieved chunks are dropped; no valid citation → "can't find" | `answer.ts` |
| Prompt injection | Prompt tells the model to treat the question only as a rules question and ignore instructions in it; output must be JSON with a matching citation; rendered as plain text | `answer.ts` |
| Copyright | Disclaimer under quoted rule text (names the rulebook, not affiliated or endorsed, official rulebook governs); the excerpts panel (all retrieved text) is sent only in local development | league `+page.svelte`, `+page.server.ts` |
| Privacy notice | "Questions are saved anonymously to improve answers." under the question box | league `+page.svelte` |
| Scraping / reads | Home and sport pages cached at Vercel's edge for 10 minutes | `catalog.ts` (`CATALOG_CACHE_HEADERS`) |
| Errors | Users see generic messages; details only in server logs | league `+page.server.ts` |
| Input size | Questions limited to 500 characters (client and server) | league page and action |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities; Dependabot weekly updates | `.github/dependabot.yml` |
| Dev-only page | `/dev/colors` returns 404 in production | `routes/dev/colors` |
| Voice agent search | `/api/rules/search` requires `x-sherules-key` (constant-time check); retrieval only; no caching | `agent-search.ts` |
| Voice tokens | LiveKit secret stays on the server; each token is for one new random room, valid 10 minutes, with the agent dispatched by name; CSP allows connections only to `*.livekit.cloud` | `voice.ts`, `vite.config.ts` |

---

## 3. Item Status

| Item | Status |
|---|---|
| H1 Copyright / text shown | ✅ Disclaimer live; excerpts panel removed in production. Still open: consider shorter quotes, or asking rights holders for permission (business decision) |
| H2 Global spend cap | ✅ 500/day site-wide. **Your action:** budget alert + API key restriction (§5) |
| H3 Reversible visitor ids | ✅ HMAC with secret; counters expire after 2 days. **Your action:** set `RATE_LIMIT_SECRET` (§5) |
| M1 Security headers / CSP | ✅ Done; tested: theme toggle, fonts, chips and forms work with CSP enforced |
| M2 Full-access DB token | ✅ App no longer writes to Turso. **Your action:** read-only token in Vercel (§5) |
| M3 Personal info in questions | ✅ Privacy note; no visitor details logged; 1,000-entry cap |
| M4 Prompt injection | ✅ Prompt guard; add injection attempts to the eval set when it's built |
| M5 Unthrottled page reads | ✅ Edge caching on home and sport pages |
| L1 Dependency updates | ✅ Dependabot |
| L2 Season rollover | Open (future): re-ingest each season; consider URL checksums |

---

## 4. Cleanup

| # | Item | Status |
|---|---|---|
| C1 | README was the scaffold text | ✅ Rewritten |
| C2 | Unused `favicon.svg` and `ui/card` component | ✅ Deleted |
| C3 | `.env.example` missing Redis + secret | ✅ Updated |
| C4 | Excerpts panel with distances | ✅ Local development only |
| C5 | `found=false` warning in logs | Kept (useful for tracing not-found answers) |
| C6 | Example questions per sport, not per league | Open (do when adding the next league; see Sport Expansion Plan) |
| C7 | 3 USA Volleyball definition labels use older capitalization | Optional: `npm run ingest -- usav-indoor-rules-2025-27` |
| C8 | Unused PDFs in `data/` | Local only; keep for future sources |

---

## 5. Launch Checklist (Account Settings)

**Vercel → Project → Settings → Environment Variables (Production):**
- [ ] `RATE_LIMIT_SECRET`: output of `openssl rand -hex 32`
- [ ] Redis connected (`KV_REST_API_URL`, `KV_REST_API_TOKEN` present). **Required:** without Redis or the secret, production refuses questions
- [ ] `TURSO_AUTH_TOKEN`: replace with a **read-only** token (Turso dashboard → database → Create Token → read-only; or `turso db tokens create sherules --read-only`). Keep the full-access token only on your machine for ingest
- [ ] Redeploy after changing variables

**Turso:**
- [ ] Drop the old limits table (no longer used): `DROP TABLE IF EXISTS ask_usage;` in the SQL editor, using the full-access token

**LiveKit Cloud:**
- [ ] Usage limit or billing alert (voice is billed by the minute)
- [ ] `SHERULES_AGENT_KEY` stored as an Agent Builder secret, used in the HTTP tool header

**Google Cloud (Gemini project):**
- [ ] Billing → Budgets & alerts: monthly budget (e.g. $20) with alerts at 50% and 90%
- [ ] APIs & Services → Credentials → API key → restrict to the Generative Language API

**Vercel:**
- [ ] Deployment Protection: off for production (public), on for preview deployments

**Smoke test on production:**
- [ ] Each league answers a question; not-found works
- [ ] "N of 5 free questions left today" shows and counts down
- [ ] Theme toggle works; fonts load; no console errors
- [ ] Response headers include `content-security-policy` (browser dev tools → Network)
- [ ] `/dev/colors` returns 404
- [ ] `npm run logs` shows the test questions

---

## 6. Incident Response

| Situation | First steps |
|---|---|
| Key leaked | Revoke and recreate in Gemini / Turso / Upstash; update Vercel env vars; redeploy; check usage dashboards |
| Spend spike | Lower `ASKS_PER_DAY` / `GLOBAL_ASKS_PER_DAY` and redeploy, or turn on Deployment Protection temporarily; check `npm run logs` for patterns |
| Wrong answer reported | Find it in `npm run logs`; reproduce with `npm run ask`; add it to the eval set; fix chunking or prompt |
| Takedown request | Remove the source's rows (`DELETE FROM chunks WHERE source_id = …` with the full-access token); remove from `sources.ts`; redeploy; respond |
