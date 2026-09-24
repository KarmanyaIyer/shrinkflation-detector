# Direction 4: "The Fine Print"

Folder: `MOCK/4-story/`. Port: 8104.

## The idea

An interactive data story in the tradition of The Pudding, The Upshot, and Reuters Graphics.
The site reads like a long-form article reporting what 16 days of daily checks actually found,
with a sticky graphic that transforms as you scroll, then hands the reader the tools: the
assistant, the full change table, search, and a methodology box. It is honest journalism about
the data, including the unexpected finding: prices moved both ways almost evenly and shrinks
were rare. The headline states a finding. It is not a slogan.

## Look

- Newsprint-clean: white `#FFFFFF` page, ink `#121212`, rules `#DADADA`, secondary text
  `#555555` minimum. Semantic pair for the data, chosen to read as "costs you more" vs "costs
  you less": vermilion `#E4572E` and teal `#17827A`. Neutral dots `#C4C4C4`. Nothing else.
- Type: an editorial serif for headline and body, because this is a publication. Use
  "Newsreader" (optical sizes, 400 to 700, italics) from Google Fonts for headline and body at
  19 to 20 px with generous leading, a clean grotesque for charts, labels, and UI: "Public Sans"
  or "Libre Franklin" 400 to 700. Do not use Fraunces or Instrument Serif.
- Classic article furniture: kicker in small caps above the headline, byline "By Karmanya Iyer",
  a dek, body column about 640 px, charts that break out wider than the text column,
  annotations drawn on the charts with thin leader lines, a methodology box in a gray-ruled
  aside, footnotes.

## Headline and lede

Write the headline as a finding from the data, in sentence case, for example (write your own,
checked against stats.json): "In 16 days of checks at one Kroger, prices moved 74 times.
Packages shrank 3 times." The dek adds one concrete fact. The lede paragraph tells the reader
what was measured and how, in two or three plain sentences. The byline line also carries
"Checked every morning at 7 a.m. Eastern". Links back to karmanyaiyer.com and GitHub sit in a
slim masthead bar with the project name "Shrinkflation Detector" as the publication's name.

## Scrollytelling sequence (sticky graphic, text steps scrolling over it)

Use one canvas or SVG graphic that stays pinned while 5 or 6 step cards scroll past; transitions
are tweened (700 ms, ease in-out) between states. Use IntersectionObserver or scrollama
(jsdelivr, pinned) and d3 (cdnjs, pinned) if you want them.

1. All 1,242 products appear as small neutral dots arranged in a grid grouped by category, with
   category labels. Step text: what is being tracked.
2. The 78 products that changed light up in their color; the rest dim. Step text: the count and
   what counts as a change.
3. The 78 dots fly into a beeswarm along a horizontal axis of unit price change (%), zero in the
   center, "costs you less" left, "costs you more" right, with an annotation on the largest
   moves (Kodiak waffles +23.1%, Reese's Puffs −27.3%). Step text: prices moved both ways.
4. Zoom on the 3 shrinks: each gets an annotation card with its label text before and after,
   verbatim ("192 ct" to "56 ct", at $6.99), and the unit price jump. Step text: what shrank,
   and a plain note that two of them are multipack labels that lost their pack count, which is
   what the label says, not a lab measurement.
5. The one that grew: Khloud popcorn 4 oz to 5 oz at $5.99, unit price down 20%.
6. Back to all 1,242, a quiet state, handing off to the tools below.

## Tools section (after the story)

- "Ask the data": the assistant as a newsroom-style interactive: a large serif input with a
  hairline underline, example questions as underlined text links in a row, the answer set in the
  body serif, the tool calls listed as a small "How this answer was found" disclosure with each
  call's name, arguments, and ms, model and tokens in the footnote style.
- "Every change": a sortable table in the grotesque, with filters as a segmented row and a
  category select, and small inline bars showing unit price change magnitude in the semantic
  colors. Rows open the product detail.
- "Find a product": search over the 1,242 names (client-side) with results as a clean list.

## Product detail

A side drawer styled like a graphics card: product name as a small headline, a step chart of
unit price over time with annotated change points, the state history as a small table, and a
one-sentence summary written from the data (e.g. "Seen at 6 oz for $5.79 from Sep 7 to Sep 16,
then $5.99 with a $4.99 promo."). Escape closes.

## Methodology box

"How this works" as the classic gray-ruled box: numbered paragraphs with real numbers (25 API
calls per run, 433 label parses by DeepSeek V4.1 Flash costing $0.08 in total, 1,370 stored
states, the publish rule, unit price definition, Pydantic validation), plus the stack in one
line. Footnotes for caveats.

## Motion

Only the scrolly transitions, the step cards' fade, and a hover highlight on dots with a
tooltip. Everything calm and precise. Reduced motion: each step shows its final state with a
crossfade, no flying dots.

## Mobile

The standard mobile scrolly pattern: graphic pinned to the top 55% of the viewport, step cards
scrolling over the lower part with a white background and a shadowless hairline border. The
table becomes stacked rows. Body text 18 px.

## Avoid

Dramatic "exposé" tone, puns, bold claims the data does not support, big gradient headers,
cards with shadows, a generic blog template look. It must look like a real graphics desk piece.
