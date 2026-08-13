# xAI fidelity verification

Read this file before handoff. Do not claim high fidelity from code inspection alone. Verify the visual result at the actual target route and states.

## Contents

- Required audit
- Computed-style checks
- Visual and responsive checks
- Interaction and accessibility checks
- Full-page procedure
- Tolerances
- Exception reporting

## Required audit

1. Identify the page/component's density context and primary task.
2. Run the `content-icons.md` inventory. Verify every remaining text node and icon has one unique task role; remove duplicates, decorative affordances, and optional empty slots.
3. Confirm all edited visual values resolve through `--xai-*` tokens or documented semantic/data exceptions.
4. Inspect default and applicable hover, focus-visible, pressed, selected/current, disabled, loading, empty, error, and open states.
5. Render target desktop plus 1024, 768, 480, and 360px when the scope is responsive.
6. Capture the full page after segmented scrolling and lazy-load stabilization.
7. Compare against the xAI contract and relevant evidence/pattern, then fix the largest-area mismatch first.

## Computed-style checks

Inspect representative elements in DevTools or browser automation:

- body, H1, H2, paragraph, compact label, mono/code;
- primary/secondary/icon button;
- input/select/tab;
- warm card, white detail, row divider, floating surface;
- navigation idle/current;
- dialog/menu or any changed overlay.

Record/confirm `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `color`, `background-color`, `border-width/color`, `border-radius`, `box-shadow`, `padding`, `gap`, `width/height`, and transition values. Reject accidental browser/framework defaults.

## Visual and responsive checks

- The result reads as xAI without logo or copied content: near-black/white/warm hierarchy, medium display type, hairlines, flat surfaces, sparse orange, pills, and quiet icons.
- One dominant task/surface/narrative is clear. The interface does not become a generic card grid.
- Alignment and repeated baselines remain exact. Long labels, translations, numeric changes, and empty/loading states do not shift the layout.
- No unexpected blue/purple gradients, green selection, colored icon tiles, glass blur, thick borders, heavy shadow, or hover lift remains.
- At each breakpoint, columns recompose, controls remain usable, and primary content/actions survive before secondary metadata.
- There is no accidental horizontal page overflow. Code/table overflow is contained.

## Interaction and accessibility checks

- Keyboard-only navigation reaches every control in a meaningful order.
- Focus-visible uses a 1px near-black outline with 3px offset and is never clipped.
- Pointer hover does not become sticky on touch.
- Menus/dialogs/drawers support Escape, focus management, and outside dismissal where appropriate.
- Native semantics, labels, accessible names, current/expanded/invalid/busy states, status announcements, and error associations are correct.
- Touch hit areas reach 44×44px on mobile.
- Reduced motion removes decorative animation without hiding state changes.
- Verify contrast, 200% zoom, and long content.

## Full-page procedure

1. Open the route at the target viewport.
2. Scroll by approximately 80% of viewport height.
3. Pause after each step for lazy assets/observers.
4. Repeat until document height is stable for at least two checks.
5. Inspect final rows, CTA/footer if present, and any sticky/fixed collision.
6. Return to the top and capture a full-page image.
7. Inspect top, at least one middle crop, and bottom. For very long pages, inspect every major section boundary.

## Tolerances

Use these acceptance tolerances when comparing an implementation to this skill's parameters:

| Property                       |                                                   Tolerance |
| ------------------------------ | ----------------------------------------------------------: |
| Color channel                  | exact token; max ±2 only for browser color-space conversion |
| Border width                   |                                                   exact 1px |
| Radius                         |          exact token; max ±0.5px raster/computed conversion |
| Font size/line height/tracking |                            exact computed value; max ±0.5px |
| Control height                 |                              exact specified tier; max ±1px |
| Padding/gap                    |                                     exact token; max ±0.5px |
| Icon box                       |                     exact tier; max ±1px optical SVG bounds |
| Motion duration                |                   exact token; max ±10ms library scheduling |
| Major layout width/offset      |                              max ±4px at reference viewport |

Do not use tolerance to justify a different scale. Normalize browser rounding at the component root rather than accumulating drift.

## Screenshot comparison

When a direct reference exists, overlay screenshots at 50% opacity or run an image diff. Fix in this order:

1. canvas/shell/section dimensions;
2. typography and text wrapping;
3. large surfaces and media crops;
4. control size/alignment;
5. borders/radii/icons;
6. color nuance and motion.

For a custom page without a direct xAI reference, compare representative components to the parameter contract and compare overall composition to the semantic patterns in `composition-grammar.md`. Do not force custom content into an unrelated page screenshot.

## Exception reporting

Report every remaining variance and its reason: missing licensed font/media, intrinsic content length, browser rasterization, accessibility requirement, data visualization semantics, or platform safe area. Do not call a result “100% identical” when an exception remains; report which computed parameters and visual gates do match.
