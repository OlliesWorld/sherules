// Prints the most recent logged questions from Redis.
// Usage: npm run logs          (newest 20)
//        npm run logs -- 100   (newest 100)
// Needs REDIS_URL (standard Redis), or KV_REST_API_URL + KV_REST_API_TOKEN (Upstash).
// On Vercel: Project → Settings → Environment Variables (copy the value into your terminal or .env).
import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';

// Same key as src/lib/server/log.ts (that file can only be imported inside SvelteKit).
const LOG_KEY = 'sherules:logs';

const count = Number(process.argv[2] ?? 20);

/** Reads the newest entries, from whichever kind of Redis is configured. */
async function readEntries(): Promise<Record<string, unknown>[]> {
	const redisUrl = process.env.REDIS_URL;
	if (redisUrl) {
		const client = createClient({ url: redisUrl });
		await client.connect();
		const raw = await client.lRange(LOG_KEY, 0, count - 1);
		await client.quit();
		return raw.map((entry) => JSON.parse(entry));
	}

	const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
	if (url && token) {
		// The Upstash client parses JSON entries for us, so each item is already an object.
		return new UpstashRedis({ url, token }).lrange<Record<string, unknown>>(LOG_KEY, 0, count - 1);
	}

	console.error('Set REDIS_URL, or KV_REST_API_URL and KV_REST_API_TOKEN.');
	process.exit(1);
}

const entries = await readEntries();

console.log(`\n${entries.length} most recent questions (newest first):\n`);
for (const entry of entries) {
	const cited = Array.isArray(entry.citations) && entry.citations.length > 0 ? `  cited: ${entry.citations.join(', ')}` : '';
	console.log(`${entry.timestamp}  ${String(entry.result).padEnd(12)} ${entry.sport}/${entry.league}  ${entry.ms ?? '-'}ms`);
	console.log(`  "${entry.question}"${cited ? `\n${cited}` : ''}\n`);
}
