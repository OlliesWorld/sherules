# SheRules — Adding a Sport or League

How to add a new sport, or a new league to an existing sport, from finding the rulebook to shipping the page. The routes, search and answer code already work for any sport. Adding one is mostly a new source entry, a parser if the rulebook's layout is new, a few display settings, and eval questions.

## Checklist

1. [ ] Decide the pages and research the official rulebook(s)
2. [ ] Download the PDF(s) to `data/<sport>/` and dump the text
3. [ ] Write a structure report and get it approved
4. [ ] Pick an existing parser or write a new one
5. [ ] Add the source(s) to `src/lib/ingest/sources.ts`
6. [ ] Dry run until the summary is clean
7. [ ] Regression check: existing sources still parse the same (`npm run snapshot`)
8. [ ] Display settings: names, color, icon, example questions
9. [ ] Add eval questions and run the eval
10. [ ] `npm run check` and `npm test`
11. [ ] Ingest, check locally, commit and push

Steps 1–10 need no API keys. Only the ingest (step 11) and the eval (step 9) do.

## 1. Decide the pages and research the sources

Each page is `/<sport>/<league>`, for example `/hockey/pwhl`. A page answers only from the sources ingested for that sport and league.

| Situation | What to do | Example |
|---|---|---|
| The league publishes its own rulebook | One source for the league | WNBA, PWHL |
| The league plays another body's rules | Use those rules, and add a `BORROWED_RULEBOOKS` note naming the league(s) | Pro volleyball (USA Volleyball), NWSL (IFAB Laws) |
| Several leagues share one rulebook and none publishes its own | One page with league slug `all`. Its heading shows just the sport name | Rugby (World Rugby Laws for college, USA Rugby and WER) |
| Official rulings or memos exist alongside the rulebook | Add them as extra sources on the same page | NCAA women's hockey interpretations |

For each source, find:

- **The official PDF URL.** It has to be the direct link to the PDF, because answers link to `<url>#page=N`. If the PDF came from somewhere else, find the same file on the publisher's site and compare file sizes.
- **The season(s)** it covers.
- **Men's and women's coverage.** A shared book (NCAA soccer and ice hockey) needs extra care: see step 9.
- **Reuse terms.** Most publishers prohibit reproduction. Every source so far gets the same treatment: PDFs stay out of the repo, production hides excerpts, and answers link to the official PDF.

## 2. Download and dump

```bash
mkdir -p data/<sport>
curl -sSL -o data/<sport>/<name>.pdf "<official PDF URL>"
npx tsx scripts/dump-pdf.ts data/<sport>/<name>.pdf > /tmp/<name>.txt
```

`data/` is gitignored. Never commit a PDF.

The dump shows the text exactly as the parsers will see it, page by page (`===== PAGE n =====`). Page numbers in `sources.ts` are these PDF page numbers, not the numbers printed in the book.

Things to look for, all seen in books so far:

- **How headings look:** "RULE 1" alone or with a title; "1.2 SECTION" or "SECTION 2."; numbered or titled articles.
- **Running headers and footers** repeated on every page (they must be dropped). Some are useful: IFAB and World Rugby footers name the current Law.
- **Missing punctuation.** NCAA fonts print "�" for periods (handled by `clean()`); World Rugby's PDF has no sentence periods at all.
- **Diagrams and signal pages** whose labels come out as stray short lines.
- **Two-page spreads** (IFAB): one PDF page holds two printed pages.

## 3. Structure report

Before writing code, write a short report and get it approved:

- Sources, with URLs, page counts and seasons
- The layout: heading levels, and what one chunk will be (an article, a section, a case)
- How chunks will be labeled. Use the book's own citation style (Rule 12.2, Law 14.9, Rule 401, Situation 7), because that's what answers show and what users can look up.
- Page ranges to ingest and to skip, with reasons
- Men's/women's handling, if the book is shared
- Display: league names, a color (a hex works), and an icon idea

## 4. Pick or write a parser

### Existing parsers

| Parser | Layout | Used by |
|---|---|---|
| `ncaa-rulebook` | `RULE 1` / `1.2 SECTION` / `1.2.3 Article` with titles | NCAA volleyball |
| `ncaa-sections` | `RULE 1` / `SECTION 2.` / `Art. 3.` | NCAA basketball |
| `ncaa-articles` | `RULE 1` / `1.1 SECTION` / untitled `1.1.1` articles | NCAA soccer |
| `ncaa-hockey` | `RULE 94 - TITLE` / `94.1 Title - text`, titled appendices | NCAA ice hockey |
| `fivb-rules` | `RULE 1.` / `1.2 Sub-rule` / `1.2.1:` points | USA Volleyball rules |
| `usav-casebook` | Numbered cases with Ruling and Reference | USA Volleyball casebook |
| `nba-rules` | `RULE NO. 1—` / `Section I—` / `a.` items | WNBA |
| `ifab-laws` | Law footers / `1. Section` / subheadings, titled protocol ranges | IFAB Laws (NWSL) |
| `caps-headings` | `ALL-CAPS HEADINGS:` with lettered parts | NWSL competition rules |
| `world-rugby-laws` | Law footers / caps subheadings / `5.` numbered laws, definitions, sevens variations | World Rugby Laws |
| `pwhl-rules` | `Rule 24 Title` / `24.3 Title` (NHL style) | PWHL |
| `usah-rules` | `Rule 401 Title` / `(a)` items, then per-section casebooks | USA Hockey |
| `memo` | Numbered rulings, or a one-topic memo | NCAA women's hockey memos |

A book from a publisher already covered often fits an existing parser. If one almost fits, prefer a new small parser over adding options to a working one. A new parser can't change how existing sources parse.

### Writing a new parser

1. Add the name to `ParserName` in `src/lib/ingest/types.ts`, with a one-line layout comment.
2. Create `src/lib/ingest/chunk-<name>.ts` exporting `parse<Name>(pages, source): ParseResult`. Start the file with a comment showing the layout, as the other parsers do.
3. Register it in the `parsers` map in `src/lib/ingest/parsers.ts`. The ingest and snapshot scripts both read that map.

Conventions the existing parsers follow:

- **Shared helpers** in `pdf-lines.ts`: `collectLines()` (with an `isPageFurniture` callback for the book's headers and footers), `openChunk()`, `addChunk()` with a "starts a new line" pattern for list items, `titleCase()`, `clean()`.
- **Report, don't guess.** Push a `problems` entry for anything unexpected, such as a rule number out of sequence or text outside any rule. The dry run lists them. When a book really skips numbers (deleted rules), report the gap rather than silently accept it.
- **Sequence checks** keep cross-references from being read as headings. A line starting "71.2 and 76.3)" is text, because 71.2 isn't the next article.
- **Chunk size:** split chunks over ~600 words into ~500-word pieces at the book's own item boundaries, labeled by what they hold ("Rule 13, Section II, a–c", "Rule 604(c)–(f)") or "(part 2)".
- **Unique refs.** The ingest stops on a duplicate ref, since chunk ids are built from refs.
- **`headingPath`** (e.g. "Rule 14 – Tackle > Player Responsibilities") is embedded along with the text, so a short chunk like "Coach's Challenge: Not applicable." can still be found.

## 5. Add the source

Add an entry to `src/lib/ingest/sources.ts`:

```ts
{
	id: 'pwhl-rules-2025-26',          // stored on every chunk; never change it after ingesting
	name: 'PWHL Official Rule Book 2025-2026',   // shown on answer cards
	url: 'https://…/2025-2026_PWHL_Rulebook.pdf', // direct PDF link (answers open url#page=N)
	file: 'data/hockey/2025-2026_PWHL_Rulebook.pdf',
	sport: 'hockey',
	league: 'pwhl',
	season: '2025-26',
	division: 'all',
	parser: 'pwhl-rules',
	ranges: [{ from: 18, to: 159, type: 'rule' }],
	skipped: [
		{ from: 1, to: 17, reason: 'Cover, officials roster, table of contents' },
		{ from: 160, to: 188, reason: 'Reference tables (summaries of the rules)' }
	]
}
```

| Field | Notes |
|---|---|
| `ranges` | Each range is `type: 'rule'` or `'interpretation'` (casebooks, rulings). Optional `layout: 'definitions'` marks a glossary; optional `title` names a range whose printed title can't be read reliably (IFAB protocols, appendices, one-topic memos) |
| `skipped` | Every page not in a range should be listed with a reason. The dry run warns about any page in neither |
| `skipPages` | Single pages inside a range to leave out, such as a diagram |
| `season` | Shown on the league tile. Use the current season for two-season books |

## 6. Dry run

```bash
npm run ingest -- <source-id> --dry-run
```

No API calls and nothing stored. Check the summary:

- **Pages that didn't parse cleanly:** should be empty, or only expected skips and real gaps in the book's numbering
- **Chunks per rule:** a rule with suspiciously few chunks usually means a missed heading
- **Words per chunk:** the maximum should be about 600; a tiny minimum is fine if it's a real one-line rule
- **Sample chunks:** read them. Look for running headers, diagram labels or page numbers mixed into the text, and lines glued together that should be separate
- **WARNING: pages not in any range or skip list:** add them to one or the other

Fix and repeat until the summary is clean. Most new books take a few rounds.

## 7. Regression check

If you changed a shared file (`pdf-lines.ts`, `types.ts`) or an existing parser, confirm every existing source still parses exactly as before:

```bash
npm run snapshot -- save       # before the change: records every source's parser output
# ...change the parser...
npm run snapshot -- compare    # after: each source is "identical" or "CHANGED"
```

Every source you didn't mean to change must come out `identical`. For a `CHANGED` one, the script names the first chunk that differs, to start looking from. Add source ids to either command to check only those. Snapshots go in `data/snapshots/` (gitignored, since they contain rulebook text), and no API keys are needed.

A new parser that doesn't touch shared code can't change other sources, but the check takes a couple of minutes, so run it anyway. Once a change is intended and checked, run `save` again so the next comparison starts from it.

## 8. Display settings

| File | What to add |
|---|---|
| `src/lib/labels.ts` | `SPORT_NAMES` (sport), `LEAGUE_NAMES` and `LEAGUE_LEVELS` (new league slugs), `EXAMPLE_QUESTIONS` (four "Try asking" questions the rulebook answers), and `BORROWED_RULEBOOKS` for a page using another body's rules |
| `src/routes/layout.css` | A `[data-sport='<slug>']` block with the accent color |
| `src/lib/components/SportIcon.svelte` | An original line drawing of the ball or puck, using `currentColor`. No league logos or marks |
| `src/routes/dev/colors/+page.server.ts` | Add the sport to the list, to compare colors side by side |

### The accent color

Colors are written in OKLCH: lightness, chroma (how saturated), hue. Each theme normally sets the lightness and each sport sets chroma and hue. When the color is a specific hex, convert it to OKLCH (an online converter such as oklch.com works) and set all three for light mode. Then give dark mode a lighter version of the same hue, because dark colors disappear on the navy background:

```css
/* Purple #33058d in light mode; lighter in dark mode, so it reads on navy. */
[data-sport='hockey'] {
	--sport-l: 32.5%;
	--sport-c: 0.187;
	--sport-h: 284;
}

.dark [data-sport='hockey'] {
	--sport-l: 72%;
	--sport-c: 0.16;
	--sport-h: 300;
}
```

Checks before shipping:

- Text contrast at least **4.5:1** in both themes, against the background and against cards
- On `/dev/colors` (run `npm run dev`), the new color is easy to tell apart from every other sport in both themes, including dark mode, where colors get lighter and closer together
- It doesn't read as an error message (the error red is hue 28)

## 9. Eval questions

Add 5–7 questions for each new page to `evals/questions.json` (format in [EVALS.md](EVALS.md)):

- Common rules questions, with the expected ref copied from the dry run
- At least one `not_found` question: stats, trivia or history the rulebook can't answer
- For a shared men's and women's book, a question where the rules differ, with a `mustInclude` that proves the answer gave the women's rule
- For variants (rugby sevens, experimental rules), a question that needs the variant

The answer prompt (`src/lib/server/answer.ts`) already tells the model that answers are for women's games and how to handle sevens excerpts. A new kind of variant may need its own line there. If you add one, re-run the full eval, since the prompt is shared by every page.

## 10. Checks

```bash
npm run check   # type and Svelte checks: 0 errors
npm test        # unit tests
```

## 11. Ingest and ship

```bash
npm run ingest -- <source-id>       # needs GEMINI_API_KEY, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (write token)
npm run eval -- --page <sport>/<league>
npm run dev                         # check the page locally
```

Each ingest replaces that source's chunks. It ends with "Stored N chunks", which should match the dry run.

Then commit and push. Vercel deploys automatically. No environment variables change, and the live site reads the same Turso database. The list of sports is cached for up to 10 minutes, so a new sport can take a few minutes to appear on the live home page.

After shipping, update the source and parser tables in [TECH_SPEC.md](TECH_SPEC.md) and the coverage in [PRD.md](PRD.md).

## Not covered by these steps

- **Voice:** "Ask by voice" is only on NCAA volleyball (`VOICE_LEAGUES` in `src/lib/voice.ts`), and the agent's search endpoint only searches that page. Adding voice to another page is separate work.
- **New seasons of an existing book:** download the new PDF and dry run it with the same parser. Layouts often shift slightly between editions, so check the summary carefully. A new source id keeps the old season's chunks unless you remove them.
