---
name: apply-merge-gateway-style
description: "Analyze, design, restyle, or implement frontend pages and components in the visual language of Merge Gateway: quiet enterprise AI/SaaS layouts, hairline borders, restrained charcoal/sage/orange colors, editorial typography, product-UI illustrations, code panels, tabs, and subtle motion. Use when the user mentions Merge Gateway, merge.dev/gateway, asks to match that site's borders/colors/type/images/interactions, requests a calm technical B2B aesthetic, or wants later HTML/CSS/React/Vue frontend changes to follow this style."
---

# Apply Merge Gateway Style

Recreate the design logic of Merge Gateway without copying its brand, logo, marketing copy, or original image assets. Preserve the product's information architecture and existing frontend conventions while applying the style systematically.

## Load the references

- Read [references/style-system.md](references/style-system.md) before changing visual styles, layout, typography, components, or motion.
- Read [references/product-visuals.md](references/product-visuals.md) when creating or revising screenshots, dashboard mockups, SVG illustrations, charts, code panels, tables, routing diagrams, or other product imagery.

## Work in this order

1. Inspect the existing frontend stack, design tokens, shared components, page structure, responsive rules, and current user changes.
2. Classify the screen as marketing/editorial, overview/dashboard, dense management, or secondary/edit before choosing its width and header treatment.
3. Identify what must remain unchanged: content hierarchy, routes, behavior, data flow, accessibility semantics, and public component APIs.
4. Map the current UI to the reference system instead of scattering one-off CSS values.
5. Add or revise semantic tokens first: canvas, surface, text, border, accent, radius, shadow, spacing, and motion.
6. Update shared primitives next: typography, buttons, pills, cards, tabs, tables, code panels, dividers, and focus states.
7. Recompose around the primary task: use an editorial hero only when the page itself is a destination; keep routine management headers compact and let the operational surface dominate.
8. Add motion last. Keep it short, purposeful, transform/opacity-based, and safe under `prefers-reduced-motion`.
9. Verify desktop, tablet, and mobile layouts. Exercise hover, keyboard focus, active, copied, expanded, loading, empty, and error states where relevant.

## Choose width and hierarchy by page type

- Let dense admin tables, logs, charts, and configuration workbenches inherit the available application-shell width. Avoid placing a second centered marketing max-width inside an already padded shell.
- Keep routine management headers to a title, optional one-line description, and necessary actions. Do not wrap them in a decorative hero card unless the header communicates a critical state or primary action.
- Reserve large sage atmospheres, contour art, display-scale headings, and generous hero padding for marketing pages, onboarding, landing views, and selected overview dashboards.
- Inspect the effective width as `viewport - sidebar - shell gutters - page max-width`. Remove compounded constraints before shrinking columns or typography.
- Make the primary operational panel the largest and earliest visual mass on management pages.

## Make implementation decisions

- Reuse the project's framework and component system. Avoid introducing a new UI library solely for this look.
- Prefer CSS variables or the project's token mechanism over literal values inside components.
- Preserve existing fonts if they are part of the product identity. If a close Merge-like result is requested, use a licensed geometric display sans for headings and Inter/system sans for body copy; never fetch proprietary fonts without authorization.
- Build product visuals as accessible HTML/CSS/SVG when they must respond to data, localization, theme, or user interaction. Use raster images only for static decorative art or supplied screenshots.
- Keep diagrams illustrative rather than deceptive. Label mock data as sample data when users could mistake it for live values.
- Keep orange rare. Reserve it for the primary attention cue, a critical progress state, or one editorial accent—not every button and icon.
- Use shadows only to establish hierarchy. Let borders, spacing, and alignment carry most of the structure.
- Prefer one convincing product fragment over a collage of unrelated floating cards.

## Preserve the signature feel

- Use warm charcoal rather than pure black for most text.
- Use white and near-white surfaces with low-contrast gray or khaki/sage atmosphere.
- Use 1px hairline borders, 15–16px primary card radii, 8–12px control radii, and full pills for navigation and actions.
- Set display headings tightly with compact line height and negative tracking; set body copy at a relaxed 1.5 line height.
- Alternate editorial text blocks with high-fidelity product UI fragments.
- Use status colors semantically: green for healthy/routed, amber for fallback/warning, red for blocked/error, orange for spend or a single priority signal.
- Let mobile layouts stack naturally. Do not shrink dense desktop dashboards until their labels become unreadable; crop, simplify, or switch to a mobile composition.

## Avoid style drift

Do not add neon gradients, purple AI glows, glassmorphism, thick borders, exaggerated blur, bouncy motion, scale-on-every-hover, crowded card mosaics, or decorative 3D objects. Do not make every section sage or orange. The style depends on white space and restraint.

## Validate the result

- Compare the implementation at approximately 1440px, 1024px, 768px, and 390px widths.
- Confirm body text contrast, visible keyboard focus, minimum 44px touch targets where practical, and reduced-motion behavior.
- Confirm that cards remain aligned to the page grid and that 1px dividers render crisply.
- Confirm that tab changes, copy feedback, accordions, and sticky/header states communicate state without layout shift.
- Confirm that the page still reads correctly with images unavailable.
- Report the files changed, the reusable tokens/components introduced, and any intentional deviations from the reference system.
