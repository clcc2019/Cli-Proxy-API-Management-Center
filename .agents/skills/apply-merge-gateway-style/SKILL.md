---
name: apply-merge-gateway-style
description: "Analyze, design, restyle, or implement frontend pages and components in the visual language of Merge Gateway: quiet enterprise AI/SaaS layouts, hairline borders, restrained charcoal/sage/orange colors, editorial typography, product-UI illustrations, code panels, tabs, and subtle motion. Use when the user mentions Merge Gateway, merge.dev/gateway, asks to match that site's borders/colors/type/images/interactions, requests a calm technical B2B aesthetic, or wants later HTML/CSS/React/Vue frontend changes to follow this style."
---

# Apply Merge Gateway Style

Recreate the design logic of Merge Gateway without copying its brand, logo, marketing copy, or original image assets. Preserve the product's information architecture and existing frontend conventions while applying the style systematically.

## Load the references

- Read [references/style-system.md](references/style-system.md) before changing visual styles, layout, typography, components, or motion.
- Read [references/component-spec.md](references/component-spec.md) before creating or auditing any individual component. It defines the anatomy, state matrix, motion, and anti-patterns for every primitive (buttons, inputs, selects, checkboxes, toggles, cards, dividers, tables, badges, stat cards, tabs, modals, toasts, empty/error/permission states, skeletons, code panels, charts, progress, navigation, page headers, toolbars, pagination, tooltips, accordions, forms). Work through it component by component instead of restyling ad hoc.
- Read [references/product-visuals.md](references/product-visuals.md) when creating or revising screenshots, dashboard mockups, SVG illustrations, charts, code panels, tables, routing diagrams, or other product imagery.

Choose the minimum reference set that covers the task, but always load the style system first:

| Task | Required references |
|---|---|
| Audit or restyle a page | `style-system.md` + the touched sections of `component-spec.md` |
| Create or change a primitive | `style-system.md` + all of that primitive's `component-spec.md` section |
| Create product imagery or a visual mockup | `style-system.md` + `product-visuals.md` + the relevant component sections |
| Change only behavior/content | inspect the references for constraints, then avoid visual edits unless the behavior exposes a state gap |

Do not treat the references as a mood board. The token names, page mode, state matrix, accessibility contract, and anti-patterns are implementation requirements.

## Work in this order

1. Inspect the existing frontend stack, design tokens, shared components, page structure, responsive rules, and current user changes.
2. Classify the screen as marketing/editorial, overview/dashboard, dense management, or secondary/edit before choosing its width and header treatment.
3. Identify what must remain unchanged: content hierarchy, routes, behavior, data flow, accessibility semantics, and public component APIs.
4. Map the current UI to the reference system instead of scattering one-off CSS values.
5. Add or revise semantic tokens first: canvas, surface, text, border, accent, radius, shadow, spacing, and motion.
6. Update shared primitives next, auditing each one against its section in [references/component-spec.md](references/component-spec.md): typography, buttons, inputs, selects, checkboxes, toggles, cards, dividers, tabs, tables, badges, modals, toasts, empty/error/permission states, skeletons, code panels, charts, accordions, and focus states. Fix the primitive, not the consumer; when two implementations of the same primitive exist (e.g. a global class and a component module), converge them to one spec-compliant source.
7. Recompose around the primary task: use an editorial hero only when the page itself is a destination; keep routine management headers compact and let the operational surface dominate.
8. Add motion last. Keep it short, purposeful, transform/opacity-based, and safe under `prefers-reduced-motion`.
9. Verify desktop, tablet, and mobile layouts. Exercise hover, keyboard focus, active, copied, expanded, loading, empty, and error states where relevant.

Before editing, write a short internal design brief with four decisions: page mode, primary task/action, largest visual surface, and the one semantic accent. Use it to reject decorative changes that compete with the task.

For a reference-site refresh, first capture one desktop view of the relevant reference area and identify its surface hierarchy, action contrast, divider rhythm, and density. Translate those relationships into the target product; do not copy its brand, assets, or marketing composition wholesale.

## Choose width and hierarchy by page type

- Use this decision table before choosing a container or hero:

| Page mode | Width | Header | Dominant surface | Accent budget |
|---|---|---|---|---|
| Marketing / destination | centered `--mg-content-max` | editorial hero is allowed | product proof or code panel | orange eyebrow/CTA detail; sage atmosphere |
| Overview / dashboard | shell width, wide where data needs it | compact or restrained overview header | summary strip + primary chart/workflow | one status or threshold cue |
| Dense management | available shell width | compact title + required actions | table, log, form, or workbench | semantic states only |
| Secondary / edit | shell width or readable form cap | title + back/context action | form or focused detail panel | primary action plus validation colors |

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
- On operational screens, give the primary action the sole high-contrast fill (usually warm charcoal); keep companion actions white with hairline borders.
- Use the existing primitive API and DOM semantics unless a change is explicitly requested. Visual restyling must not silently change routes, form submission, keyboard behavior, data loading, or public props.
- Make every touched primitive pass the shared state matrix in `component-spec.md`; if a state is not supported, decide whether the component should gain it or whether the consumer must use a different primitive.
- Keep layout stable across state changes: reserve slots for icons, validation text, loading indicators, tab panels, and sticky headers. Avoid JS-driven measurements when CSS layout can express the relationship.
- Add tokens before adding component values. If a value appears twice, it probably belongs in a token; if it appears once, document why it is an intentional exception.

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
- Walk each touched component through its full state matrix from [references/component-spec.md](references/component-spec.md) (default, hover, focus-visible, active/selected, disabled, loading, empty, error) instead of only checking the resting state.
- Confirm body text contrast, visible keyboard focus, minimum 44px touch targets where practical, and reduced-motion behavior.
- Confirm that cards remain aligned to the page grid and that 1px dividers render crisply.
- Confirm that tab changes, copy feedback, accordions, and sticky/header states communicate state without layout shift.
- Confirm that the page still reads correctly with images unavailable.
- Confirm the heading outline, accessible names, status text, error associations, focus restoration, and keyboard order at the stacked/mobile composition.
- Confirm no essential information depends on hover, color alone, an image, or an animation.
- Report the work in this format: `page mode and primary task`; `files changed`; `tokens/primitives reused or added`; `states and viewports verified`; `intentional deviations and why`; `remaining risks or follow-ups`.

Definition of done: the page has one clear visual hierarchy, all touched primitives use semantic tokens, responsive behavior is an intentional re-composition, interactive states are complete, and the result preserves existing behavior and accessibility semantics.
