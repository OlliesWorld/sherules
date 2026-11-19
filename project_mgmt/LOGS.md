# Finding the user question logs (SheKnows + SheRules)

Both apps save each user question to the same Redis database, under different keys.

| App | Redis key | Each entry has |
|---|---|---|
| SheRules | `sherules:logs` | question, sport, league, result (`answered` / `not_found` / `rate_limited` / `at_capacity` / `error`), cited rule numbers, search matches, rewritten query, glossary terms, time taken, timestamp. **Not** the answer text. |
| SheKnows | `she-knows:logs` | claim, result (scores, `truthPct`, `claim_type`, explanation, sources) or `off_topic` / `error`, timestamp. |

Both lists keep the newest 1,000 entries; older ones drop off.

## Where the database lives

- Redis Cloud, connected through the **Vercel Redis integration**.
- Database: **sherules-storage** (#14686735)
- Public endpoint: shown on the database's Configuration tab in Redis Cloud (not written here because this repo is public)
- The connection string is `REDIS_URL` in Vercel → (SheRules or SheKnows) → Settings → Environment Variables. Both apps should have the same value.

## Option 1: the browser (Redis Insight)

1. Open the database in Redis Cloud: Vercel → Storage → sherules-storage → open in Redis, or go to cloud.redis.io → Databases → **sherules-storage**.
2. On the **Configuration** tab, in the card **"View and manage data with Redis Insight"**, click **Launch**.
3. In Redis Insight's **Browser**, search for `sherules:logs` or `she-knows:logs`.
4. Click the key. It's a list: item 0 is the newest question, and each item is one JSON entry.

## Option 2: the terminal (`npm run logs`)

You need `REDIS_URL` locally first. In the project folder, either:
- copy it from Vercel into `.env` (gitignored), or
- run `vercel env pull .env` (needs the Vercel CLI, linked to the project).

**SheKnows only:** the value must go on its own line **after the closing backtick** of `SHE_KNOWS_PROMPT`. Anything inside the backticks becomes part of the prompt.

Then:

```bash
npm run logs                       # newest 20
npm run logs -- 100                # newest 100
npm run logs -- 200 --misses       # SheRules only: "not found" answers among the newest 200
```

SheKnows also supports `npm run logs -- --errors` (failed requests only) and `npm run logs -- --json` (raw entries).

## If the log is empty or isn't growing

1. **Is it the right database?** The host in `REDIS_URL` (in Vercel) should match the public endpoint on the Configuration tab.
2. **Ask one question on the live site**, then refresh Redis Insight.
3. **Check Vercel's runtime logs** (Project → Logs) for:
   - `Redis not configured`: `REDIS_URL` isn't set for that environment.
   - `Failed to write … log to Redis`: Redis is unreachable or the URL is wrong.
4. Questions asked from local dev go into the same lists, so test questions show up there too.

## Things to know

- **Persistence:** the Redis Cloud banner says the free Vercel plan doesn't include "data persistence". If the database restarts, the logs could be wiped. To keep long-term history, export the list now and then.
- **Archiving:** SheKnows' old Upstash database was archived for inactivity on 2026-11-19, and logging failed silently (each request waited 4.3s on retries). If logs stop appearing, check that the database is still active.
- No IP addresses or visitor details are logged.
