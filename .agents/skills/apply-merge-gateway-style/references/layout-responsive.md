# xAI layout and responsive system

Use this file for pages, sections, shells, navigation, toolbars, grids, and responsive behavior. Shell measurements are available patterns, not mandatory templates.

## Contents

- Density contexts
- Container and gutters
- Operational shell
- Documentation shell
- Public/editorial layout
- Grids and toolbars
- Breakpoint behavior
- Safe areas and overflow

## Density contexts

| Context | Type range | Control | Section rhythm | Surface character |
|---|---|---|---|---|
| Operational | 13–27px | 32–41px | 27–40.5px | white canvas, warm grouped cards, dense data |
| Technical | 13.5–54px | 27–41px | 31.5–67.5px | connected warm frame plus local dark code |
| Editorial | 18–67.5px | 36–41px | 54–135px | broad white/black/warm fields and media |

These share one visual system. Mix contexts only when content requires it; do not average their scale.

## Container and gutters

- Operational page inline gutter: 27px desktop; 22.5px below 1024; 18px below 768/480; 13.5px at 360 when necessary.
- Operational content should use available width; limit only readable prose/forms locally to 630–810px.
- Editorial content grid: full-width section with consistent inner gutter; use a 12-column grid and 18–27px column gap (**normalized**).
- Editorial readable blocks: 540–720px. Media/feature regions may span the grid.
- Section separation: operational 27–40.5px; technical 40.5–67.5px; editorial 67.5–135px.

## Operational shell

Use a persistent rail only when the product needs multi-group navigation:

- Desktop rail: 306px measured; content `minmax(0, 1fr)`.
- Rail height: viewport; independent vertical scroll; white; no separating border by default.
- Rail outer spacing: 27px; account/team control: up to 288×36px; nav row: 36px; group gap: 27–36px.
- Main measured width at 1512px viewport: approximately 1177–1188px after shell/gutters.
- Idle nav: gray; current: near-black/medium; optional 5% neutral row fill. No colored bar/tile.

For an existing smaller shell or component-only task, keep its functional footprint and apply the xAI row, spacing, icon, state, and surface grammar. Do not add a 306px rail decoratively.

## Documentation shell

Use a 306px categorized rail only when persistent docs navigation is real. Main content may open with one warm 18px connected workbench. A common desktop split is 40/60 or 45/55 explanation/technical content (**normalized from observation**). Keep header tools compact and align subsequent content to the same main grid.

## Public/editorial layout

- Header height: 54–67.5px normalized, sparse links, black/outlined pill actions.
- Hero block padding: 81–135px top/bottom. H1 max width should produce short intentional lines.
- Media/product split: use 5/7, 6/6, or 7/5 columns according to content; gap 27–54px.
- Product collage: use deliberate spans and mixed aspect ratios, not equal cards.
- Major metric field: three or fewer aligned columns over a 54px faint grid; do not use for routine data.
- CTA/footer only when the information architecture needs them.

## Grids and toolbars

- Card grid gap: 13.5–18px operational; 18–27px editorial.
- Two-level catalog: warm discovery grid followed by white details/table; do not create a third card level.
- Analytical hierarchy: use one dominant region plus subordinate summaries. A 2:1 layout is acceptable when data supports it.
- Toolbar minimum height: 40.5px; control gap 9–13.5px; primary actions right or beside title; filters wrap as a group.
- Divider-led lists span available width. Tables use stable column alignment.

## Breakpoint behavior

Treat breakpoints as layout thresholds:

| Width | Required behavior |
|---:|---|
| ≥1280 | full grid and rail; preserve intended whitespace |
| 1024–1279 | reduce 3–4 columns to 2; tighten gutters to 22.5px; wrap secondary toolbar groups |
| 768–1023 | convert persistent rail to drawer or compact rail; stack major splits; keep 44px touch hit areas |
| 480–767 | one-column cards; 18px gutter; toolbar/actions wrap or stack; tables scroll/recompose |
| 360–479 | 13.5–18px gutter; full-width principal buttons as needed; remove secondary metadata first |

Use `clamp(45px, 7vw, 67.5px)` for editorial H1 below desktop. Never scale an entire desktop surface. Preserve DOM/focus order when visually rearranging.

## Safe areas and overflow

- Apply `env(safe-area-inset-*)` to fixed mobile navigation, drawers, composers, and footer actions.
- Code and dense tables scroll horizontally inside their own region. Do not let the page acquire accidental horizontal overflow.
- Use `min-width: 0` on grid/flex children and stable scrollbar behavior.
- Sticky controls must not cover focused content; provide scroll padding equal to sticky height plus 18px.
