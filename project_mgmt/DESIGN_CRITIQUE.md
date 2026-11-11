# SheRules: Design Critique and Decisions

**Date:** November 9–10, 2026
**Reviewed:** the homepage (`/`) and the NCAA volleyball question page (`/volleyball/ncaa`), showing a real question and answer from the live site
**Status:** round 1 changes merged to `main`. Round 2 (league tabs) is on the `league-picker-style` branch

## Summary

I ran an AI-assisted design critique of SheRules, then decided each finding myself. Primary user: a fan watching a women's game who just saw a call they didn't understand, on their phone.

The review scored the site 26/40 on Nielsen's usability heuristics ("Acceptable"). Of its six ranked findings, I acted on two (one only in part) and turned down the other four. Testing on a real iPhone overturned the review's top recommendation for the question page.

The review was useful, and it also needed a human editor. Not every suggestion fit this product: some were sound as general guidance but missed how SheRules is actually used or what I wanted it to feel like. It caught real issues, like the path to the question box and a screen reader gap, and deciding which suggestions to keep was the most valuable part of the exercise.

## How it was reviewed

- **Tools:** the Impeccable design skill (v4.8.1), run through Claude Code.
- **Two independent passes:** one AI reviewer judged the design from screenshots and source code. A second ran Impeccable's automated detector and took measurements. Neither saw the other's results before they were combined.
- **Widths:** desktop (1440×900) and phone (390×844), from the production site.
- **Real device:** I checked the two things headless screenshots couldn't show on my iPhone.

## Findings and decisions

| Page | Finding | Decision | Why |
|---|---|---|---|
| Home | The headline says "Ask any rules question", but the question box is two pages away | **Built, using my own design** | The review suggested a "back to your last league" shortcut. I proposed putting the league choice on the sport page, next to a disabled question box |
| Home | The hero pushes the sport tiles down on a phone, leaving Volleyball alone at the bottom | Declined | The review suggested removing the "Women's sports, decoded" pill to make room. I like the pill, so it stays |
| Home | Nothing explains why the answers can be trusted | Declined | Trust comes with the answer itself, which shows the rule and links to the rulebook page |
| Question page | Nothing scrolls the answer into view, so the keyboard might hide it | **Rejected after testing** | On iPhone the keyboard closes on Enter and the answer and rulebook link are visible. The review's concern was an inference and it was wrong |
| Question page | The answer isn't plain enough: it says "entitled to" and includes bracketed rule references | Declined | The rule reference sits at the end of the answer, where it doesn't get in the way |
| Question page | The rule card's number is louder than the answer | Declined | The large rule number stays |
| Question page | The four-line limit on quoted rules hides some of the rule | Declined | Four lines is enough for someone to decide whether they want more, and the link is right there |
| Question page | The "Open source" link reads like software | **Built, revised through discussion** | Now "Read page 51 →". The page number moved into the link and came off the line above, so it isn't repeated |
| Question page | Rule links might open at page 1 on iOS, breaking the "exact page" promise | **Tested, no change needed** | The PDF opens at the correct page on iPhone |

### Smaller items

- **Tap targets under 44px (declined):** the review flagged the breadcrumb (31px), theme toggle (36px), example questions and "Ask by voice" (38px). At 44px these secondary controls would be too big for the design.
- **Screen readers (fixed):** the rule card's `aria-label` replaced its contents, so screen readers skipped the quoted rule.
- **Placeholder text (declined):** the review suggested moving "Name the moment you saw" into the question box. The placeholder stays as it is.
- **Pill contrast (fixed):** the pill I kept was 4.17:1 contrast in light mode, the only text on either page below WCAG AA. I darkened its text and kept the pill.

### Automated detector

- **Source scan:** no findings, but the tool only does limited matching on Svelte files and says its results are an undercount.
- **Rendered pages:** three findings on the homepage and one on the question page. The eyebrow pill and its low contrast are real. The "AI color palette" warning on the background glow looks like a false positive, because the glow is the sport's own accent color at low opacity.

## What was built

**League buttons**

- Tapping a sport now shows small league buttons above a question box that stays disabled until a league is picked. An answer can't come from the wrong rulebook by accident.
- I chose buttons over a dropdown. A dropdown takes two taps, and no sport has more than three leagues.
- Rugby has one league, so it skips the picker. Returning visitors land on their last league, and the buttons stay visible for switching.
- First-time visitors still make two taps, sport then league, but see the question box right away.
- The tradeoff: the league tiles' extra detail (level and whose rulebook is used) is gone. The rulebook is named once a league is picked.

**Link wording**

- "Open source" became "Read page 51 →", and the disclaimer was reworded to match.

**Screen reader fix**

- Removed the rule card's `aria-label`, so screen readers now read the rule number, the quoted rule and the link text.

**Pill contrast**

- Darkened the "Women's sports, decoded" text in light mode so it meets WCAG AA.

## Round 2: League tabs

**Date:** November 10, 2026

### Getting to the design

I didn't like how the first league buttons looked, because they were too rounded. The design went through a few versions:

1. **Rounded pill buttons** (round 1). Too bubbly.
2. **Squarer separate buttons.** This was my own quick edit.
3. **One connected bar**, with the leagues joined in a single outlined control. This was the AI's suggestion. It read as one large button, which isn't what I had in mind.
4. **Underlined text tabs.** This was my idea, and the one I kept. Each league is text with its own bottom line, and the picked league turns the sport's color.

I then worried a fan wouldn't realize the tabs were tappable before picking a league. Two changes addressed that:
- Before a pick, the tabs show dark text with a sport-colored underline instead of gray.
- The prompt changed to "Tap a league to start".

### Second critique

I reran the same two-reviewer critique on the sport page and league tabs, at phone and desktop widths, in light and dark. This time the reviewers were told about my round 1 decisions so they wouldn't raise them again.

- **Score:** 31/40 ("Good"), up from 26/40 for the pages in round 1. The flows aren't identical, so this isn't a strict comparison.
- **Automated detector:** no findings, in the source or on the rendered pages.
- **My worry:** the review's answer was "mostly yes". Most fans should find the tabs within a second or two. Some may tap the disabled question box first.

| Finding | Status |
|---|---|
| On the sport page, the disabled Ask button is still the sport color, so the dead question box looks like the thing to tap | Open |
| Before a pick, the light underline is 1.9:1 contrast, below the 3:1 guideline for controls. Full sport color would pass | Open |
| "Tap a league to start" is styled like a subtitle, so it may be skimmed past | Open |
| Returning visitors may briefly see the sport page before going to their last league (inferred from the code, not tested) | Open |
| The keyboard focus outline on the sport page isn't the sport color, but it's visible | Open |

## Limits

- The league tabs were checked in a local browser with test data, not yet on the live site.
- The review covered one question on one league page. Other leagues and the "can't find it" state weren't reviewed visually.
- Scores come from an AI reviewer's judgment, not from user testing.
