# Product visual recipes

Use this reference to create the “images inside the page”: high-fidelity product fragments that explain reliability, cost, routing, security, and customer controls.

## Contents

- Core construction and internal UI grammar
- Asset fidelity, accessibility, and responsive delivery
- Reliability, budget, routing, and request-log recipes
- Tenant controls and hero code panels
- Composition rules and anti-patterns

## Core construction

Create each visual from one recognizable application surface, not an abstract illustration:

- Use a transparent or white canvas.
- Use a 15–16px outer radius and a 1px `#eaeae9` border when the visual has a containing card.
- Use charcoal `#2c2a25` for headings and strong values, `#565551` for body/UI text, and `#807f7c` or `#abaaa8` for secondary metadata.
- Use a soft shadow only for a floating alert, tooltip, or dominant card.
- Use cropped edges intentionally so the product feels larger than the illustration frame.
- Render at 2× pixel density when exporting raster assets. Prefer SVG for line art, tables, labels, and UI mockups.
- Keep text as real HTML when localization, accessibility, or live data matters. Keep SVG text as text where the delivery pipeline supports the required fonts.

## Asset and fidelity contract

Choose the delivery format by behavior, not by convenience:

| Visual need | Preferred format | Minimum contract |
|---|---|---|
| Live data, localized copy, keyboard interaction | HTML/CSS/React/Vue | real semantics, responsive reflow, loading/empty/error states |
| Static line art, contour, routing diagram | SVG | `viewBox`, meaningful `title`/`desc` or `aria-hidden`, no clipped essential labels |
| Supplied screenshot or decorative texture | raster/WebP/PNG | 2× export density, compressed file, meaningful alt text or decorative treatment |
| Chart or table that communicates a decision | live chart/table | visible summary and an accessible data representation |

When a visual is illustrative rather than live, label mock data as sample data if a reasonable user could mistake it for production values. Do not invent a provider, customer, security state, or performance claim that the surrounding copy does not support.

Fidelity checks for every product visual:

- Keep the dominant frame between 15–16px radius and 1px border; use one floating element at most and keep its anchor obvious.
- Keep final-size labels at least 12px and line-height around 1.4. If the visual cannot support readable labels, crop it to one meaningful fragment instead of shrinking the whole dashboard.
- Define a safe inset for the claim, status marks, and controls. Responsive cropping may remove decoration or secondary rows, never the primary signal.
- Preserve the same empty/loading/error language as the real product. A marketing mockup should still look like an intentional state, not a broken screenshot.
- Check the asset on white and pale sage/khaki backgrounds, at 100% browser zoom, and with images disabled. Essential information must remain available as text outside the asset.

## Internal UI grammar

- Use 1px dividers and control strokes.
- Use 8px input radii, 12px medium containers, and 15px outer cards.
- Use 12–14px labels and metadata, 16–20px control values, and 24–32px feature-card headings at the final display size.
- Use uppercase section labels with moderate letter spacing for small category headings.
- Use low-contrast gray chips and sage selection rings.
- Use monospaced text for request IDs, code, tokens, and logs.
- Use icons as thin outline geometry. Avoid glossy icon tiles.

## Recipe: reliability and fallback routing

Compose a vertical system diagram:

1. Place a compact “model uptime” status card at the top.
2. Represent uptime as a row of thin vertical ticks: mostly green, occasional amber, rare red.
3. Place a primary provider/model row below with two bordered selects.
4. Connect it with a thin muted line to partially cropped fallback rows numbered 2 and 3.
5. Use white surfaces, 15px radii, subtle shadows, and no decorative background.

Communicate the sequence spatially. Do not add arrows and labels everywhere; the offset rows and connector line should carry the story.

## Recipe: budget and spend control

Compose a simple chart on a transparent canvas:

1. Use a green cumulative area/line chart with thin light grid lines.
2. Put a large amber warning zone above a soft-stop threshold and a dark red hard-limit zone at the top.
3. Add one dashed threshold line and one compact label.
4. Float a white notification card over the chart: bold event summary, gray status/time metadata, 15px radius, soft shadow.
5. Keep axes and weekday labels subdued.

Use orange/amber because it has operational meaning. Avoid decorative gradients inside the chart.

## Recipe: routing policy builder

Compose a two-column configuration card:

1. Use a title row separated by a hairline.
2. Put large radio rows on the left: Priority, Intelligent, and Build your own.
3. Emphasize the selected row with a sage border/ring and stronger text.
4. Put benchmark rows on the right with neutral category chips, source metadata, and right-aligned percentages.
5. Use red only for the one low or problematic score.

Keep the UI flat. Let alignment, rules, and the selected ring create hierarchy.

## Recipe: request/security log

Compose a table fragment:

1. Place a search field across the top.
2. Put a compact row of filter controls beneath it.
3. Use clear column headers, 1px row dividers, and 12–14px table text.
4. Use a small status dot before routed, fallback, blocked, and cached labels.
5. Use green, amber, and red dots semantically; keep the rest monochrome.
6. Optionally include a large outline cursor near one filter to imply configurability.

Crop the provider/model column or lower rows rather than shrinking the table.

When this recipe becomes a real authenticated log page, let the live table span the available application-shell width and keep the page title compact. The marketing-page 1196px container and decorative hero treatment do not apply when they reduce visible columns or push operational content below the fold.

## Recipe: end-user or tenant controls

Compose a narrow vertical management card:

1. Use a header with a left title and right “+ New …” action.
2. Use a two-column table header and generous row height.
3. For each customer, show a bold name, a muted routing policy, a spend cap, a thin progress track, a percentage, and a muted ownership badge.
4. Use soft sage badges for “own key,” neutral gray for “managed,” and orange for the one near-limit progress bar.
5. Crop the card vertically after two or three complete examples to imply a longer list.

## Recipe: hero code panel

Build this as HTML when possible:

- Use a 15px white card with 1px border, clipped overflow, and `0 20px 65px rgb(0 0 0 / 7%)`.
- Put language tabs at the top and provider pills at the bottom.
- Keep code in the center with line numbers or syntax colors at low saturation.
- Show only the copy control for the visible code sample.
- Keep the card height stable while switching language/provider.
- Make copy feedback visible, short-lived, keyboard operable, and announced to assistive technology.

## Composition rules

- Match the illustration subject to the adjacent claim. Reliability needs routing/fallback; cost needs thresholds; control needs policy UI; security needs logs or filters.
- Put the strongest visual weight near the text baseline, not centered mechanically inside a huge empty box.
- Use one dominant frame, one secondary floating element at most, and one semantic accent.
- Keep important text and status marks inside a safe inset so responsive cropping does not remove the story.
- Ensure transparent assets remain legible on both pure white and pale sage/khaki sections.
- Keep the DOM/source order aligned with the claim: heading → explanation → action → visual proof is the safe default. If CSS reorders columns, verify mobile reading order and focus order separately.
- For responsive visuals, define three states explicitly: full desktop composition, simplified tablet composition, and essential mobile crop/recomposition. Do not rely on one `transform: scale()` rule.
- Use `alt=""` for purely decorative visuals and put the explanation in nearby text; use a concise alt for a meaningful static visual; use a live accessible representation for data-bearing visuals.

## Avoid

- Avoid generic browser chrome unless the browser itself matters.
- Avoid fake 3D perspective, neon glows, translucent glass cards, and purple/cyan AI gradients.
- Avoid tiny unreadable dashboard screenshots used as decoration.
- Avoid equal use of every status color.
- Avoid more than two shadow depths in one visual.
- Avoid copying Merge's logos, customer names, exact sample data, or original source assets.
