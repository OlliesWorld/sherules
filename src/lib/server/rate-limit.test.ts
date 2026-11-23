// Tests for the daily limits, especially the app's (per install, under a per-IP ceiling).
// Uses an in-memory counter instead of Redis. Run with: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	APP_ASK_LIMITS,
	APP_IP_CEILING,
	appGate,
	ASK_LIMITS,
	ipGate,
	takeAll,
	type Limiter,
	type LimitRule
} from './rate-limit.ts';

function memoryLimiter(): Limiter & { counts: Map<string, number> } {
	const counts = new Map<string, number>();
	const change = (key: string, by: number) => {
		const value = (counts.get(key) ?? 0) + by;
		counts.set(key, value);
		return value;
	};
	return {
		counts,
		secret: 'test-secret',
		counter: {
			get: async (key: string) => (counts.has(key) ? String(counts.get(key)) : null),
			incr: async (key: string) => change(key, 1),
			decr: async (key: string) => change(key, -1),
			expire: async () => true
		} as unknown as Limiter['counter']
	};
}

/** The site-wide count for a rule today. */
function everyone(limiter: ReturnType<typeof memoryLimiter>, rule: LimitRule): number {
	const day = new Date().toISOString().slice(0, 10);
	return limiter.counts.get(`sherules:${rule.name}:${day}:all`) ?? 0;
}

async function times<T>(n: number, fn: () => Promise<T>): Promise<T[]> {
	const results: T[] = [];
	for (let i = 0; i < n; i++) results.push(await fn());
	return results;
}

describe('appGate', () => {
	it('allows 5 questions per install, then reports the visitor limit', async () => {
		const limiter = memoryLimiter();
		const gate = appGate(limiter, 'install-a', '1.2.3.4');
		assert.deepEqual(await times(5, gate.take), ['ok', 'ok', 'ok', 'ok', 'ok']);
		assert.equal(await gate.left(), 0);
		assert.equal(await gate.take(), 'visitor_limit');
	});

	it('counts installs on one IP separately (shared carrier IPs)', async () => {
		const limiter = memoryLimiter();
		await times(5, appGate(limiter, 'install-a', '1.2.3.4').take);
		const other = appGate(limiter, 'install-b', '1.2.3.4');
		assert.equal(await other.left(), 5);
		assert.equal(await other.take(), 'ok');
	});

	it('stops one IP at the ceiling, however many installs it has', async () => {
		const limiter = memoryLimiter();
		let ok = 0;
		for (let i = 0; i < 10; i++) {
			const results = await times(5, appGate(limiter, `install-${i}`, '1.2.3.4').take);
			ok += results.filter((result) => result === 'ok').length;
		}
		assert.equal(ok, APP_IP_CEILING.perVisitor);
		// Uses refused at the ceiling don't count against the app's site-wide cap.
		assert.equal(everyone(limiter, APP_ASK_LIMITS), APP_IP_CEILING.perVisitor);
	});

	it('gives back both the install and IP counts on refund', async () => {
		const limiter = memoryLimiter();
		const gate = appGate(limiter, 'install-a', '1.2.3.4');
		await gate.take();
		await gate.refund();
		assert.equal(await gate.left(), 5);
		assert.equal(everyone(limiter, APP_ASK_LIMITS), 0);
		assert.equal(everyone(limiter, APP_IP_CEILING), 0);
	});

	it('keeps app questions out of the website counts', async () => {
		const limiter = memoryLimiter();
		await times(5, appGate(limiter, 'install-a', '1.2.3.4').take);
		const web = ipGate(limiter, '1.2.3.4');
		assert.equal(await web.left(), 5);
		assert.equal(everyone(limiter, ASK_LIMITS), 0);
		assert.equal(await web.take(), 'ok');
	});
});

describe('takeAll', () => {
	it('gives back earlier uses when a later rule is over its limit', async () => {
		const limiter = memoryLimiter();
		const first: LimitRule = { name: 'first', perVisitor: 10, perDay: 100 };
		const second: LimitRule = { name: 'second', perVisitor: 1, perDay: 100 };
		const steps: [LimitRule, string][] = [
			[first, 'a'],
			[second, 'a']
		];
		assert.equal(await takeAll(limiter, steps), 'ok');
		assert.equal(await takeAll(limiter, steps), 'visitor_limit');
		assert.equal(everyone(limiter, first), 1);
		assert.equal(everyone(limiter, second), 1);
	});
});
