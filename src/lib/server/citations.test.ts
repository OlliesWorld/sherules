import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { matchCitation } from './citations.ts';

describe('matchCitation', () => {
	it('matches the chunk label exactly, ignoring case, spacing, brackets and a leading "Rule"', () => {
		assert.equal(matchCitation('Rule 11.2.1', ['Rule 11.2.1']), 'Rule 11.2.1');
		assert.equal(matchCitation('[Rule 7.1.1]', ['Rule 7.1.1']), 'Rule 7.1.1');
		assert.equal(matchCitation('13 situation 1', ['Rule 13, Situation 1']), 'Rule 13, Situation 1');
		assert.equal(matchCitation('point system', ['Point System']), 'Point System');
	});

	it('maps a sub-rule to the chunk that holds it', () => {
		assert.equal(matchCitation('Rule 11.3.1', ['Rule 11.4', 'Rule 11.3', 'Case 11.30']), 'Rule 11.3');
		assert.equal(matchCitation('Rule 604(a)', ['Rule 604', 'Rule 604, Situation 2']), 'Rule 604');
		assert.equal(matchCitation('Rule 94.1', ['Rule 94.1 (part 2)', 'Rule 94.1']), 'Rule 94.1');
	});

	it('prefers the most specific chunk', () => {
		assert.equal(matchCitation('Rule 11.3.2.1', ['Rule 11.3', 'Rule 11.3.2']), 'Rule 11.3.2');
	});

	it('maps a rule inside a numbered range to the range chunk', () => {
		assert.equal(matchCitation('Law 8.1', ['Law 8.3', 'Law 8.1–8.2']), 'Law 8.1–8.2');
		assert.equal(matchCitation('Law 14.9', ['Law 14.1–14.3', 'Law 14.5–14.11']), 'Law 14.5–14.11');
		assert.equal(matchCitation('Rule 12.7.10', ['Rule 12.7.1–12.7.9']), undefined);
		assert.equal(matchCitation('Rule 12.4.3', ['Rule 12.4.1–12.4.14']), 'Rule 12.4.1–12.4.14');
	});

	it('maps a lettered item inside a lettered range', () => {
		assert.equal(matchCitation('Rule 604(d)', ['Rule 604(c)–(f)']), 'Rule 604(c)–(f)');
		assert.equal(matchCitation('Rule 604(b)', ['Rule 604(c)–(f)']), undefined);
	});

	// From the eval: the WNBA's TV-timeout answer was right, but this citation was dropped.
	it('maps a bare lettered item inside a WNBA-style range', () => {
		const wnba = ['Rule 5, Section VI-A, a–e', 'Rule 5, Section VI-A, f–k', 'Rule 5, Section VI-B, a–i'];
		assert.equal(matchCitation('Rule 5, Section VI-A, c', wnba), 'Rule 5, Section VI-A, a–e');
		assert.equal(matchCitation('Rule 5, Section VI-A, g', wnba), 'Rule 5, Section VI-A, f–k');
		assert.equal(matchCitation('Rule 5, Section VI-B, c', wnba), 'Rule 5, Section VI-B, a–i');
		assert.equal(matchCitation('Rule 5, Section VI-A, m', wnba), undefined);
		assert.equal(matchCitation('Rule 5, Section VI-C, c', wnba), undefined);
	});

	// From the eval: "5-14.11" was read as the range "5 through 14.11", so it claimed this citation.
	it('reads an NCAA basketball hyphen as part of the rule number, not a range', () => {
		const ncaa = ['Rule 5-13.2', 'Rule 5-14.11', 'Rule 5-14.10', 'Rule 5-14.1'];
		assert.equal(matchCitation('Rule 5-14.10.b', ncaa), 'Rule 5-14.10');
		assert.equal(matchCitation('Rule 5-14.10', ncaa), 'Rule 5-14.10');
		assert.equal(matchCitation('Rule 7-3', ['Rule 5-14.11', 'Rule 9-10']), undefined);
	});

	it('matches nothing for a rule that is not in any retrieved chunk', () => {
		assert.equal(matchCitation('Rule 11.30', ['Rule 11.3']), undefined);
		assert.equal(matchCitation('Rule 113', ['Rule 11.3']), undefined);
		assert.equal(matchCitation('Rule 99.1', ['Rule 11.3', 'Law 8.1–8.2']), undefined);
		assert.equal(matchCitation('Law 9.1', ['Law 8.1–8.2']), undefined);
	});
});
