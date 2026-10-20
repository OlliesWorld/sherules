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
	},

	// Pro volleyball (LOVB, MLV): neither league publishes a rulebook, so the Pro page uses
	// USA Volleyball's Indoor Rules (FIVB rules with USA Volleyball's changes) and its casebook.
	{
		id: 'usav-indoor-rules-2025-27',
		name: 'USA Volleyball Indoor Rules 2025-2027',
		url: 'https://usavolleyball.org/wp-content/uploads/2023/03/2025-2027-USAV-Indoor-Rules-Book_FINAL.pdf',
		file: 'data/usav/usav-indoor-rules-2025-27.pdf',
		sport: 'volleyball',
		league: 'pro',
		season: '2025-27',
		division: 'all',
		parser: 'fivb-rules',
		ranges: [
			{ from: 20, to: 78, type: 'rule' }, // Rules 1-28 (the game and the officials)
			{ from: 103, to: 104, type: 'rule', layout: 'definitions' }
		],
		skipped: [
			{ from: 1, to: 3, reason: 'Copyright, foreword, acknowledgments' },
			{ from: 4, to: 7, reason: 'Table of contents' },
			{ from: 8, to: 19, reason: 'Section I: modifications, rules commission, changes summary, philosophy, ball handling and conduct guidelines' },
			{ from: 79, to: 102, reason: 'Court diagrams and official hand signals' },
			{ from: 105, to: 152, reason: 'U-Volley, co-ed and paravolley rules' }
		]
	},
	{
		id: 'usav-casebook-2025-27',
		name: 'USA Volleyball Casebook of Approved Rulings (rev. Jan. 1, 2026)',
		url: 'https://usavolleyball.org/wp-content/uploads/2026/02/25-27_Casebook_1-1-26.pdf',
		file: 'data/usav/usav-casebook-2025-27.pdf',
		sport: 'volleyball',
		league: 'pro',
		season: '2025-27',
		division: 'all',
		parser: 'usav-casebook',
		ranges: [
			{ from: 9, to: 160, type: 'interpretation' } // Cases for Rules 1-27
		],
		skipped: [{ from: 1, to: 8, reason: 'Title, contents, acknowledgments, foreword, notation, change log' }]
	},
	{
		id: 'wnba-rules-2026',
		name: 'Official Rules of the WNBA 2026',
		url: 'https://cdn.wnba.com/sites/4/2026/05/2026-WNBA-Official-Rule-Book.pdf',
		file: 'data/wnba/wnba-rules-2026.pdf',
		sport: 'basketball',
		league: 'wnba',
		season: '2026',
		division: 'all',
		parser: 'nba-rules',
		ranges: [
			// Rules 1-14 end partway down page 81, where Comments on the Rules begins.
			// The parser splits page 81 at the "COMMENTS ON THE RULES" heading.
			{ from: 12, to: 81, type: 'rule' },
			{ from: 81, to: 90, type: 'interpretation' }
		],
		skipped: [
			{ from: 1, to: 9, reason: 'Cover, title, rules index' },
			{ from: 10, to: 11, reason: 'Court diagram' },
			{ from: 91, to: 91, reason: 'Back cover' }
		]
	},
	{
		id: 'ncaa-soccer-2026-27',
		name: 'NCAA Men’s and Women’s Soccer Rules Book 2026 and 2027',
		url: 'https://ncaaorg.s3.amazonaws.com/championships/sports/soccer/rules/PRXSO_RulesBook.pdf',
		file: 'data/soccer/ncaa-soccer-rules-2026-27.pdf',
		sport: 'soccer',
		league: 'ncaa',
		// Two-season book (updated Aug. 10, 2026); labeled with the current season.
		season: '2026-27',
		// One book for men and women. Differences are inline ("For Division I men only, ..."),
		// and the answer prompt asks for the women's rule where they differ.
		division: 'all',
		parser: 'ncaa-articles',
		ranges: [
			{ from: 13, to: 89, type: 'rule' } // The Rules introduction, then Rules 1-17
		],
		skipped: [
			{ from: 1, to: 5, reason: 'Cover, title page, copyright' },
			{ from: 6, to: 6, reason: 'Table of contents' },
			{ from: 7, to: 8, reason: 'Rules committee members' },
			{ from: 9, to: 11, reason: 'Major rules changes summary (repeats rule text)' },
			{ from: 12, to: 12, reason: 'Significant editorial changes (list of rule numbers)' },
			{ from: 90, to: 91, reason: 'Appendices A-B: referee and assistant referee signals' },
			{ from: 92, to: 95, reason: 'Appendices C-D: concussions, accommodations for disabilities' },
			{ from: 96, to: 98, reason: 'Index' }
		],
		skipPages: {
			14: 'Contact information for the rules editor and officials coordinator',
			16: 'Field diagram (figure, measurements only)'
		}
	},

	// NWSL: matches are played under the IFAB Laws of the Game, plus the league's own
	// Competition Rules & Regulations (substitutions, suspensions, standings, ...).
	{
		id: 'ifab-laws-2026-27',
		name: 'IFAB Laws of the Game 2026/27',
		url: 'https://downloads.theifab.com/downloads/laws-of-the-game-202627-double-pages?l=en',
		file: 'data/soccer/ifab-laws-2026-27.pdf',
		sport: 'soccer',
		league: 'nwsl',
		season: '2026',
		division: 'all',
		parser: 'ifab-laws',
		// Each PDF page is a two-page spread. The protocols' printed titles sit in the margin,
		// so their ranges name them here.
		ranges: [
			{ from: 12, to: 12, type: 'rule', title: 'Time-limited substitution protocol' },
			{ from: 13, to: 13, type: 'rule', title: 'Off-field treatment and assessment protocol' },
			{ from: 14, to: 14, type: 'rule', title: 'Throw-in and goal-kick countdown protocol' },
			{ from: 15, to: 16, type: 'rule', title: '‘Only the captain’ guidelines' },
			{ from: 20, to: 21, type: 'rule', title: 'Additional permanent concussion substitutions protocol' },
			{ from: 23, to: 76, type: 'rule' }, // Laws 1-17
			{ from: 77, to: 81, type: 'rule', title: 'VAR protocol' }
		],
		skipped: [
			{ from: 1, to: 8, reason: 'Cover, contents, about the Laws' },
			{ from: 9, to: 11, reason: 'Notes on the Laws, general modifications for youth and grassroots football' },
			{ from: 17, to: 19, reason: 'Sin bins and return substitutes (youth and grassroots options, not used by NWSL)' },
			{ from: 22, to: 22, reason: 'Laws of the Game title page' },
			{ from: 82, to: 83, reason: 'FIFA Quality Programme' },
			{ from: 84, to: 97, reason: 'Law changes 2026/27 (summary and details, repeats Law text)' },
			{ from: 98, to: 131, reason: 'Glossary and practical guidelines for match officials (possible later addition)' }
		]
	},
	{
		id: 'nwsl-competition-rules-2026',
		name: 'NWSL 2026 Competition Rules & Regulations (June 24 update)',
		url: 'https://images.nwslsoccer.com/image/private/t_q-good/prd/hxoaampu8dszzp4ysbss.pdf',
		file: 'data/soccer/nwsl-competition-rules-2026.pdf',
		sport: 'soccer',
		league: 'nwsl',
		season: '2026',
		division: 'all',
		parser: 'caps-headings',
		ranges: [
			{ from: 1, to: 17, type: 'rule' } // the whole document
		],
		skipped: []
	},

	// Rugby: no US league publishes its own rulebook yet. College (NIRA and others), USA Rugby
	// competitions and Women's Elite Rugby all play World Rugby's Laws, so one page covers them.
	{
		id: 'world-rugby-laws-2026',
		name: 'World Rugby Laws of the Game 2026',
		url: 'https://passport.world.rugby/media/soypxfea/2607en-world-rugby-laws-final-compressed.pdf',
		file: 'data/rugby/world-rugby-laws-2026.pdf',
		sport: 'rugby',
		league: 'all',
		season: '2026',
		division: 'all',
		parser: 'world-rugby-laws',
		ranges: [
			{ from: 20, to: 27, type: 'rule', layout: 'definitions' },
			{ from: 30, to: 122, type: 'rule' }, // Laws 1-21
			{ from: 127, to: 135, type: 'rule', title: 'Sevens' } // college plays sevens in the spring
		],
		skipped: [
			{ from: 1, to: 5, reason: 'Cover, copyright, contents, foreword' },
			{ from: 6, to: 18, reason: 'Playing charter (philosophy, not laws), key to text and diagrams' },
			{ from: 19, to: 19, reason: 'Definitions title page' },
			{ from: 28, to: 29, reason: 'Laws of the game title pages' },
			{ from: 123, to: 125, reason: 'Under-19 variations' },
			{ from: 126, to: 126, reason: 'Sevens title page' },
			{ from: 136, to: 147, reason: '10s and Game-On (community) variations' },
			{ from: 148, to: 160, reason: 'Match official signals, back cover' }
		],
		skipPages: {
			30: 'Ground diagram (labels only)'
		}
	}
];

export function getSource(id: string): Source | undefined {
	return sources.find((source) => source.id === id);
}
