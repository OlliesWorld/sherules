// Matches the rule numbers the model cites to the chunks it was given.
//
// The model often cites the exact sub-rule it read rather than the chunk's own label:
// "Rule 11.3.1" from the chunk "Rule 11.3", "Rule 604(a)" from "Rule 604", "Law 8.1" from
// "Law 8.1–8.2". Those are real citations, so they map to the chunk that holds them.
// A rule number that isn't in any retrieved chunk still matches nothing, so made-up
// citations never reach the user.

/**
 * The retrieved chunk a cited ref belongs to, or undefined if none.
 * Prefers an exact match, then the most specific chunk containing the cited rule.
 */
export function matchCitation(cited: string, chunkRefs: string[]): string | undefined {
	const target = normalizeRef(cited);
	const exact = chunkRefs.find((ref) => normalizeRef(ref) === target);
	if (exact) return exact;

	const containing = chunkRefs
		.filter((ref) => contains(normalizeRef(ref), target))
		.sort((a, b) => normalizeRef(b).length - normalizeRef(a).length);
	return containing[0];
}

/**
 * "Rule 13, Situation 1", "[13 situation 1]" and "rule 13,situation 1" all become "13situation1".
 * En dashes become hyphens, so "8.1–8.2" and "8.1-8.2" compare equal.
 */
export function normalizeRef(ref: string): string {
	return ref
		.toLowerCase()
		.replace(/[[\]]/g, '')
		.replace(/–/g, '-')
		.trim()
		.replace(/^rule/, '')
		.replace(/[\s,]/g, '');
}

/** Whether the chunk labeled `chunk` holds the rule `target` (both normalized). */
function contains(chunk: string, target: string): boolean {
	// A sub-rule of the chunk: "11.3" holds "11.3.1"; "604" holds "604(a)".
	if (target.startsWith(chunk) && /^[.(]/.test(target.slice(chunk.length))) return true;

	// A range of numbered rules: "law8.1-8.2" holds "law8.1" and "law8.2.3".
	const numbered = chunk.match(/^(.*?)(\d+(?:\.\d+)*)-(\d+(?:\.\d+)*)$/);
	if (numbered) {
		const [, prefix, from, to] = numbered;
		const cited = target.match(/^(.*?)(\d+(?:\.\d+)*)/);
		if (!cited || cited[1] !== prefix) return false;
		const start = parts(from);
		const end = parts(to);
		const number = parts(cited[2]).slice(0, start.length);
		return number.length === start.length && compare(start, number) <= 0 && compare(number, end) <= 0;
	}

	// A range of lettered items: "604(c)-(f)" holds "604(d)".
	const lettered = chunk.match(/^(.*)\(([a-z])\)-\(([a-z])\)$/);
	if (lettered) {
		const [, base, from, to] = lettered;
		const cited = target.match(/^(.*?)\(([a-z])\)/);
		return !!cited && cited[1] === base && from <= cited[2] && cited[2] <= to;
	}

	return false;
}

function parts(number: string): number[] {
	return number.split('.').map(Number);
}

function compare(a: number[], b: number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}
