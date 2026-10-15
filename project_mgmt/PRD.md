# SheRules — Product Requirements Document

**Product name:** SheRules
**Owner:** OlliesWorld
**Date:** October 15, 2026
**Version:** 1.0 — pre-launch (MVP built, hardening before public launch)

---

## 1. Problem Statement

Fans, players, parents and coaches of women's sports regularly see a call they don't understand. The answer exists, but it's buried in a 90–160 page PDF rulebook written for officials:

- Rulebooks are long, dense and organized for referees, not fans
- Each level of play has its own book (NCAA, pro leagues, national governing bodies), and they disagree on details
- General web search mixes men's and women's rules, high school and college, old seasons and new
- AI chatbots answer confidently from general knowledge and often cite rules that don't exist

People need a fast, plain-language answer they can trust, with the actual rule number so they can check it.

---

## 2. Product Vision

Ask a rules question about a women's sport and get a short, plain answer taken only from that league's official rulebook, with the rule cited and a link to the exact page of the official PDF.

**The user's flow:**
1. Pick a sport (Volleyball, Basketball)
2. Pick a league (NCAA, Pro, WNBA)
3. Ask a question in their own words, or tap an example
4. Read a short answer, with each cited rule shown as a card linking to the official PDF page
5. If the rulebook doesn't cover it, get "I can't find that in the rulebook" instead of a guess

**Long-term vision:** Every major women's sport and league, kept current each season, with answers people trust enough to settle an argument in the stands.

---

## 3. Target Users

### Primary: Fans watching a game
- Saw a call they didn't get; want an answer in seconds, on their phone
- Don't know rule numbers or official terminology

### Secondary: Players, parents and coaches
- Need to know what's allowed (jewelry, uniforms, substitutions, challenges)
- Value the citation, so they can show the rule to someone else

### Tertiary: Officials in training, broadcasters, journalists
- Need fast lookup across leagues and the differences between them

---

## 4. Scope

### 4.1 Shipped (MVP)

**Grounded rules Q&A**
- Answers come only from retrieved rulebook excerpts; the model is told not to use outside knowledge
- Every answer cites rule references; citations are checked against the excerpts actually retrieved, and any made-up rule number is dropped
- An answer with no valid citation becomes "I can't find that in the rulebook"
- Division differences (NCAA Division I vs Divisions II and III) are called out when the excerpt has them

**Coverage at launch**

| Sport | League | Source | Season | Chunks |
|---|---|---|---|---|
| Volleyball | NCAA | NCAA Women's Volleyball Rules Book (rules + interpretations) | 2026-27 | 372 |
| Volleyball | Pro | USA Volleyball Indoor Rules + Casebook of Approved Rulings | 2025-27 | 611 |
| Basketball | NCAA | NCAA Women's Basketball Rules Book | 2026-27 | 612 |
| Basketball | WNBA | Official Rules of the WNBA (rules + Comments on the Rules) | 2026 | 141 |

The Pro volleyball page uses USA Volleyball's rules because neither LOVB nor MLV publishes a rulebook; the page says so and notes that the leagues may use their own variations.

**Site**
- Home lists only sports that have data; each sport lists only leagues that have data
- League page: banner naming the rulebook and season, question box, example questions, answer with rule cards
- Light and dark themes (follows the device setting, with a toggle)
- Per-sport accent color (teal volleyball, orange basketball), checked for WCAG AA contrast in both themes

**Guardrails**
- 5 free questions per visitor per day, and a site-wide cap of 500 questions per day
- Questions logged (no IP or visitor details) to find gaps and build evaluations

### 4.2 Next (post-launch)
- **Evaluations:** a labeled question set run with promptfoo, checking that the right rule is retrieved and the answer is correct
- **More sources:** NCAA basketball Case Book, NCAA volleyball rules-changes documents and Challenge Review System manual, NWSL and other leagues
- **Shorter quotes:** show the exact sentence the answer relies on instead of the whole rule (also reduces how much rulebook text is shown)
- **Follow-up questions** in context of the first answer

### 4.3 Not planned
- Accounts or login
- Men's sports
- High school (NFHS) rules
- Answering from anything other than official rulebooks

---

## 5. User Flows

### Flow 1: Ask a question
```
Home → pick sport → pick league
→ League page: "Answers from the 2026-27 NCAA rulebook"
→ Type a question (or tap an example)
→ "Checking the rulebook…"
→ Answer: plain text + "From the rulebook" cards (rule number, rule text, source + page link)
   or: "I can't find that in the rulebook" + tips + example questions
   or: "Something went wrong" + Try again (question kept; doesn't use up a free question)
```

### Flow 2: Daily limit reached
```
League page shows "0 of 5 free questions left today"
→ Question box disabled
→ Card: "That's your 5 questions for today. Come back tomorrow for more."
(If the site-wide cap is reached: "We've answered all the questions we can for today.")
```

### Flow 3: Check the source
```
Rule card → opens the official PDF at the cited page (#page=N)
```

---

## 6. Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Retrieval accuracy | Right rule in the top 5 for >90% of eval questions | promptfoo eval set |
| Answer accuracy | >90% correct on eval questions | promptfoo eval set (graded) |
| False "can't find" | <10% of answerable questions | Question log (`not_found` results) + eval set |
| Made-up citations shown | 0 | Enforced in code (citation check) |
| Answer time | <5 s median | Question log `ms` |
| Repeat usage | Visitors returning within 7 days | Analytics (to add) |

---

## 7. Competitive Landscape

| Option | Women's-specific | Cites the rule | Links to official page | Multiple leagues | Won't guess |
|---|---|---|---|---|---|
| Reading the PDF | ✅ | ✅ | ✅ | ❌ one at a time | ✅ |
| Web search | ❌ mixed | Sometimes | Sometimes | ✅ | ❌ |
| General AI chatbots | ❌ | Often invented | ❌ | ✅ | ❌ |
| League/NGB websites | ✅ | ✅ | ✅ | ❌ | ✅ |
| **SheRules** | ✅ | ✅ checked | ✅ exact page | ✅ | ✅ |

---

## 8. Pricing Model

Free at launch, capped at 5 questions per visitor per day and 500 per day site-wide to control AI costs. A question costs about $0.0015 in Gemini usage ($0.004 at worst), so the site-wide cap bounds spend at roughly $0.75–2 per day. Paid tiers (more questions, saved history) can be revisited after usage data.

Running costs are almost entirely Gemini usage (2 calls per question). Database and Redis usage fit comfortably in free tiers (see TECH_SPEC §9).

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Rulebook copyright** (NCAA, USA Volleyball and WNBA books are copyrighted; USA Volleyball's says no part may be reproduced without permission) | Takedown or legal claim | See SECURITY_PLAN §3. Before launch: decide how much rule text to show, add attribution and a disclaimer, consider asking rights holders for permission |
| Wrong answer presented as official | Trust, real-world disputes | Answers only from retrieved text; citation check; link to official page; disclaimer that the official rulebook governs |
| Pro leagues use rule variations | Wrong answer for LOVB/MLV games | Banner names the USA Volleyball book and notes the leagues may differ |
| AI cost spike from abuse | Unexpected bill | Per-visitor limit; global daily cap and budget alerts (SECURITY_PLAN) |
| Rulebook URL changes to next season's edition | Page links point to a different book | Re-ingest each season; track checksums (future) |
| Model or embedding deprecations | Search or answers stop working | Model names in one place; `embedding_model` stored per row so re-embedding is targeted |

---

## 10. Milestones

| Phase | Status | Deliverables |
|---|---|---|
| Phase 1 — Ingestion | ✅ Done | PDF → chunks → embeddings → Turso, for NCAA volleyball |
| Phase 2 — Search, answers, UI | ✅ Done | RAG flow, citation check, SvelteKit UI, Vercel deploy |
| Design | ✅ Done | Design from the Lovable export, light/dark themes, sport accents |
| More leagues | ✅ Done | NCAA basketball, Pro volleyball (USAV), WNBA |
| Guardrails | ✅ Done | Daily limit, question log |
| **Launch hardening** | ⏳ Next | SECURITY_PLAN items, cleanup, README, privacy note |
| Evaluations | Planned | promptfoo eval set for retrieval + answer accuracy |
| More sources | Planned | Case books, rules-changes docs, other leagues |

---

## 11. Decisions (Resolved)

1. **Chunk by the rulebook's own structure**, not by word count, so each chunk is a complete rule with its reference. Very long sections (WNBA) are split at their lettered items.
2. **Interpretations stored separately** (`type: interpretation`) from rules, but searched together.
3. **Divisions:** NCAA books mark division differences inline, so chunks are not split by division; the answer calls out differences.
4. **Pro volleyball** uses USA Volleyball's rules, with a visible note, because LOVB and MLV don't publish rulebooks.
5. **Women's sports only;** URL slugs leave out "womens".
6. **Only sports and leagues with data are shown;** no "coming soon" tiles.
7. **Answer model:** `gemini-3.5-flash-lite` (cheapest stable); embeddings `gemini-embedding-2` at 768 dimensions.
8. **Daily limits:** 5 questions per visitor per day (by IP) and 500 per day site-wide; off in local development.
9. **Question logging:** Upstash Redis list, newest 1,000, no visitor details.
10. **Copyright:** quoted rule text carries a disclaimer naming the rulebook, disclaiming affiliation, and pointing to the official rulebook.
