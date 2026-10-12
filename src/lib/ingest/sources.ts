import type { Source } from './types.ts';

// Every document we ingest. Chunks store only `id`; name and URL are looked up here.
// Page numbers are PDF file pages (1-based), not the numbers printed in the book.
export const sources: Source[] = [
	{
		id: 'ncaa-volleyball-2026-27',
		name: 'NCAA Women’s Volleyball Rules Book 2026-27',
		url: 'https://ncaaorg.s3.amazonaws.com/championships/sports/volleyball/rules/women/PRWVB_RulesBook.pdf',
		file: 'data/ncaa-volleyball-2026-27.pdf',
		sport: 'volleyball',
		league: 'ncaa',
		season: '2026-27',
		// Division-specific rules are written inline inside articles
		// ("For Division I, ..." / "For Divisions II and III, ..."), so no article is division-only.
		division: 'all',
		parser: 'ncaa-rulebook',
		ranges: [
			{ from: 16, to: 81, type: 'rule' }, // Rules 1-19
			{ from: 102, to: 131, type: 'interpretation' } // Rules Interpretations, Rule 1 to Rule 18
		],
		skipped: [
			{ from: 1, to: 5, reason: 'Cover, title page, copyright' },
			{ from: 6, to: 6, reason: 'Table of contents' },
			{ from: 7, to: 8, reason: 'Rules committee members' },
			{ from: 9, to: 10, reason: 'Major rules changes summary (repeats rule text)' },
			{ from: 11, to: 12, reason: 'Points of emphasis' },
			{ from: 13, to: 13, reason: 'Ball handling judgment guidelines' },
			{ from: 14, to: 15, reason: 'Preface, equipment manufacturer info' },
			{ from: 82, to: 90, reason: 'Event management guidelines' },
			{ from: 91, to: 99, reason: 'Appendices A-E' },
			{ from: 100, to: 100, reason: 'Scoresheet instructions' },
			{ from: 101, to: 101, reason: 'Interpretations intro and position abbreviations' },
			{ from: 132, to: 146, reason: 'Official’s mechanics and hand signals' },
			{ from: 147, to: 151, reason: 'Index' }
		],
		skipPages: {
			20: 'Court diagram (figure, measurements only)'
		}
	},
	{
		id: 'ncaa-basketball-2026-27',
		name: 'NCAA Women’s Basketball Rules Book 2025-26 and 2026-27',
		url: 'https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/women/PRWBB_RulesBook.pdf',
		file: 'data/PRWBB_RulesBook.pdf',
		sport: 'basketball',
		league: 'ncaa',
		// Two-season book (updated Sept. 1, 2026); labeled with the current season.
		season: '2026-27',
		// Division differences are inline ("Exception (Division I only): ..."), as in volleyball.
		division: 'all',
		parser: 'ncaa-sections',
		ranges: [
			{ from: 23, to: 118, type: 'rule' } // Rules 1-11
		],
		skipped: [
			{ from: 1, to: 5, reason: 'Cover, title page, copyright' },
			{ from: 6, to: 6, reason: 'Table of contents' },
			{ from: 7, to: 8, reason: 'Rules committee members' },
			{ from: 9, to: 10, reason: 'Rules changes summary (repeats rule text)' },
			{ from: 11, to: 13, reason: 'Points of emphasis' },
			{ from: 14, to: 14, reason: 'Sporting behavior' },
			{ from: 15, to: 16, reason: 'Significant editorial changes' },
			{ from: 17, to: 17, reason: 'Preface' },
			{ from: 18, to: 20, reason: 'Equipment manufacturer info' },
			{ from: 21, to: 22, reason: 'Court diagrams' },
			{ from: 119, to: 144, reason: 'Appendices I-VII (fight reporting, officiating guidelines, foul/penalty chart, concussions, signals)' },
			{ from: 145, to: 148, reason: 'Index' }
		],
		skipPages: {
			36: 'Division I uniform rules graphic (text extracts with gaps)',
			37: 'Uniform graphic (no text)'
		}
	}
];

export function getSource(id: string): Source | undefined {
	return sources.find((source) => source.id === id);
}
