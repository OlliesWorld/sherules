// Prints the most recent logged questions from Redis.
// Usage: npm run logs          (newest 20)
//        npm run logs -- 100   (newest 100)
// Needs KV_REST_API_URL + KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* pair).
// On Vercel: Project → Storage → your Redis database → copy the .env.local snippet.
import { Redis } from '@upstash/redis';

// Same key as src/lib/server/log.ts (that file can only be imported inside SvelteKit).
const LOG_KEY = 'sherules:logs';

const count = Number(process.argv[2] ?? 20);
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
	console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).');
	process.exit(1);
}

const redis = new Redis({ url, token });
// The Upstash client parses JSON entries for us, so each item is already an object.
const entries = await redis.lrange<Record<string, unknown>>(LOG_KEY, 0, count - 1);

console.log(`\n${entries.length} most recent questions (newest first):\n`);
for (const entry of entries) {
	const cited = Array.isArray(entry.citations) && entry.citations.length > 0 ? `  cited: ${entry.citations.join(', ')}` : '';
	console.log(`${entry.timestamp}  ${String(entry.result).padEnd(12)} ${entry.sport}/${entry.league}  ${entry.ms ?? '-'}ms`);
	console.log(`  "${entry.question}"${cited ? `\n${cited}` : ''}\n`);
}
