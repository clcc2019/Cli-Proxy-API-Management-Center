# Observed xAI evidence

This file records direct Chrome DevTools observations made on 2026-08-13/14 from authenticated Console and public xAI pages. It is the evidence layer behind the classified implementation references. Measurements reflect a 1512×680 CSS-pixel viewport at DPR 2; content and branding may change over time. Use `foundations.md`, `controls.md`, `surfaces-data.md`, `layout-responsive.md`, and `motion-interaction.md` for implementation; use this file only for provenance and ambiguity resolution.

## Contents

- Audit coverage and method
- Shared measurements
- Console observations
- Docs observations
- Public observations
- Fidelity interpretation

## Evidence labels

- **Measured** means the value appeared in captured computed styles or exposed CSS variables.
- **Normalized** means the specification consolidates repeated measured relationships into a stable reusable component system.
- Normalized values are implementation rules, not claims that every observed page used that exact value.

## Audit coverage and method

Observed Console Dashboard, Models, Usage, API Keys, Code, Chat, Settings/Billing, and Storage/Collections; x.ai home, Grok, Company, Pricing, and News; Docs `/overvie` and `/overview`.

One persistent local Chrome MCP/CDP connection was used for the collection. Each route was scrolled in approximately 80%-viewport increments with pauses for lazy loading and repeated document-height checks, returned to the top, then captured as computed-style data and a full-page image. Captured public heights included Company ~7534px, Home ~8504px, Pricing ~8810px, Grok ~9532px, and News ~17058px at device-image scale. Thus below-fold conclusions are not inferred from the first viewport.

Sensitive account values, credentials, billing data, cookies, and API secrets are not part of this reference.

## Shared measurements

### Fonts

Observed loaded families include `universalSans` (400 and 550), `universalSansDisplay` (400; 550 declared), and variable `GeistMono`. Console body inheritance is 18px/27px at 400. The UI frequently overrides to 15.75px/22.5px and 13.5px/18px. Do not extract private binaries; use supplied licensed files or fallbacks.

### Color frequency and role

- Console primary: `rgb(8,8,8)` / `#080808`.
- Public/Docs primary: `rgb(10,10,10)` / `#0a0a0a`.
- Secondary Console: `rgb(125,129,135)` / `#7d8187`.
- Warm surfaces: `rgb(249,248,246)` / `#f9f8f6`.
- Inverse: `rgb(250,250,250)` / `#fafafa`.
- Orange: `rgb(255,100,10)` / `#ff640a`; only a handful of occurrences on a typical Console page.
- Exposed semantic foreground variables: success `hsl(132 41% 42%)`, warning `hsl(44 80% 34%)`, danger `hsl(353 53% 43%)`.
- Borders: `#d5d9e2` and black at about 6%, 8%, or 15% alpha.
- Common neutral fills: black at about 5% alpha.

The visual system is almost monochrome. Semantic/data colors occur only where content requires them.

### Rhythm, radius, and shadow

Recurring dimensions: `4.5, 6.75, 9, 13.5, 18, 22.5, 27, 31.5, 36, 40.5, 54, 67.5px`. Common radii in Console computed styles were full pill, 13.5px, 10px, 9px, and 6.75px. Major warm cards/workbenches visually reach 18px. Ordinary cards had no shadow. Filled primary pills used `0 1px 3px rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%)`.

### Controls and motion

- Primary actions were observed at 32px, 36px, and 41px heights. Common labels were 13.5px/18px or 15.75px/22.5px at weight 500.
- Common primary horizontal padding was 13.5px or 18px; Docs/public large actions reached 22.5px. Common icon gaps were 6.75px or 9px.
- Utility icon buttons were commonly 36×36px; period/navigation controls reached 41×41px; compact utilities appeared at 27×27px and 32×32px.
- Operational pill tabs were commonly 36px high with 6.75px block and 13.5px inline padding. Public/Docs large segments reached 41px with 9px block and 22.5px inline padding. Dark code tabs used 13.5px/18px compact text.
- Default exposed transition duration was `.15s`; default easing was `cubic-bezier(.4,0,.2,1)`. Exposed ease-out was `cubic-bezier(0,0,.2,1)` and page-slide easing was `cubic-bezier(.22,1,.36,1)`.

### Icons

Observed utility/navigation SVGs are generally 16, 18, or 20px, most with 24×24 viewBox and 2px or similarly thin strokes. Idle stroke often resolves to `#7d8187`; active stroke/ink resolves near black. The system does not rely on colorful icon containers.

## Console observations

- Desktop rail measured 306px. Main content measured roughly 1177–1188px in the 1512px viewport.
- Team selector measured about 288×36px with 10px radius. Navigation rows and utility targets cluster around 36px.
- H1 measured 27/36px, 500, -0.675px. H2 measured 22.5/31.5px, 500, -0.5625px. Small display headings measured 18/27px around 500. Controls/navigation commonly measured 15.75/22.5px. Compact labels/buttons measured 13.5/18px around 500.
- Navigation stays white and uses gray-to-black state changes without colored background wash.
- Dashboard uses warm setup surfaces and one nested white bordered sample frame. Models uses warm featured cards followed by white bordered detail. Usage uses a large warm analytical card beside two stacked warm cards.
- Primary actions are black pills; outlined pills are secondary. New/Beta is sparse orange.
- Code and Chat behave as contained workbenches. Suggestion cards are large, white, 18px, hairline bordered, and shadowless.

## Docs observations

- Docs navigation also measured 306px and independently scrolls.
- Overview starts with a broad warm `#f9f8f6` frame at 18px radius.
- Left side uses a large editorial statement with black and gray lines, body copy, black primary pill, and outlined secondary pill.
- Right side is a near-black 18px code panel with language tabs, copy affordance, mono syntax, and contained horizontal overflow.
- The dark panel is local. The page and navigation remain white/light.

## Public observations

- Public H1 commonly measured 67.5/67.5px, 500, -1.6875px. News and Docs landing titles cluster near 54px. Public section headings cluster around 33.75–40.5px, often weight 400.
- Header/navigation is small relative to the hero, with outlined and black pill actions.
- Homepage uses a designed product collage, API split, coral/red technical media field, faint engineering-grid metric chapter, recent-news row, dual warm start/support cards, and a ruled multi-column footer.
- Pricing uses warm plan cards, an extremely long divider-led comparison matrix, then a left/right Enterprise section with a 2×N warm capability grid.
- News uses a featured split and four recent story tiles, followed by a very long divider-led archive with date aligned right. It does not become a gallery of cards.
- Grok and Company use alternating large media/editorial fields and maintain the same typographic, pill, rule, CTA, and footer system across long scrolls.
- Footer treatment is light: thin rules, muted labels, plain link columns, and broad white space rather than a dark footer slab.

## Fidelity interpretation

Faithfully transfer measurable geometry, hierarchy, palette, typography relationships, surface logic, icon grammar, responsive composition, and interaction restraint. Do not invent generic design-system conventions where the measurements give a clear answer.

Exact rendered identity still depends on licensed fonts, source media, content length, browser text rasterization, viewport, and current live-site revisions. When those differ, preserve xAI's ratios and validate with screenshot overlays. Disclose missing fonts/media rather than hiding the difference or copying protected assets without authorization.
