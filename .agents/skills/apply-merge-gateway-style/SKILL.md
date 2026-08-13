---
name: apply-merge-gateway-style
description: "Analyze, design, restyle, or implement frontend pages and components for the CLI Proxy API Management Center in its current Merge Gateway-derived visual system: fixed light theme, cool-gray canvas, white operational surfaces, charcoal primary actions, sage selection/context, hairline borders, compact editorial headings, dense management layouts, and restrained motion. Use when changing this repository's React/SCSS UI, extending its design system, creating management pages, dashboards, workbenches, tables, forms, dialogs, charts, or asking later frontend work to match the current product style."
---

# Apply the Current Management Center Style

Treat the repository's current frontend as the source of truth. Preserve its React 19, SCSS, CSS Modules, routing, i18n, data flow, accessibility semantics, and public component APIs while extending one coherent visual system.

## Load only what the task needs

- Read [references/style-system.md](references/style-system.md) before any visual or layout change.
- Read [references/component-spec.md](references/component-spec.md) before creating or changing a primitive or interactive state.
- Read [references/product-visuals.md](references/product-visuals.md) for dashboards, charts, logs, provider workbenches, code editors, or illustrative product UI.

Inspect the live repository before editing because implementation may have evolved. In a CodeGraph-indexed repository, use CodeGraph first to locate tokens, shared primitives, call paths, and representative consumers.

## Work in this order

1. Classify the screen as overview, management, workbench, or secondary/edit.
2. State four internal decisions: primary task, dominant surface, information density, and semantic accent.
3. Preserve behavior, routes, copy hierarchy, i18n, keyboard behavior, and user changes.
4. Reuse the shell, tokens, and shared primitives. Fix a shared primitive before patching repeated consumers.
5. Compose the page around the operational surface; add motion only after layout and states are complete.
6. Verify responsive composition, interaction states, accessibility, and the repository's relevant type/lint/build checks.

## Choose the page pattern

| Mode | Header | Dominant surface | Width |
|---|---|---|---|
| Overview | restrained overview card or `ManagementPageHeader` | joined metrics and one primary data region | full shell width |
| Management | `ManagementPageHeader` + optional `ManagementToolbar` | table, list, log, or card collection | full shell width |
| Workbench | compact header | bordered navigation/resource split | full shell width; collapse below its breakpoint |
| Secondary/edit | contextual title/back action | focused form, detail, diff, or editor | full shell width or readable local cap |

Use the dashboard's larger 32–42px title only for a true overview. Routine pages use the shared 26–32px management title. Do not add marketing heroes, oversized display copy, decorative gradients, or an inner centered max-width to operational screens.

## Implementation rules

- Consume existing semantic variables from `src/styles/themes.scss`; do not invent a parallel token namespace in a page module.
- Keep the application fixed light unless the user explicitly requests a product-wide theme change. Do not add isolated dark-mode branches.
- Use `src/styles/components.scss` and the React wrappers for global `Button`, `Card`, `Input`, and `Modal`; use the canonical CSS Module primitives for `Select`, `Table`, `ToggleSwitch`, `SelectionCheckbox`, headers, and toolbars.
- Keep canvas gray and operational surfaces white. Use borders, spacing, alignment, and joined panels before adding fill or shadow.
- Reserve charcoal fill for primary/destructive actions by semantic variant. Use sage for selection and persistent context, teal for information, and green/amber/red for real states.
- Keep values compact: 40px controls, 8px control radii, 12px nested containers, 15px main cards, 1px borders, and 14–22px normal panel padding.
- Keep motion between 130–240ms, primarily color, opacity, and small transforms. Honor `prefers-reduced-motion`.
- Build data-bearing visuals as semantic HTML, SVG, canvas/chart components, or the existing editor; use raster assets only for static supplied imagery.
- Do not introduce a UI library or image-generation dependency for this style.
- Do not use `agent-browser` unless the user explicitly requests browser verification.

## Reject drift

Reject glassmorphism, neon or purple AI gradients, blurred shells, thick borders, excessive pills, floating-card collages, decorative 3D art, bouncy motion, hover scaling, tinted full-page sections, and color used without semantic meaning. Avoid copying Merge branding or marketing composition; this skill represents the product's current management-console adaptation.

## Definition of done

- One task and one dominant surface are visually obvious.
- Touched components use the existing tokens and canonical primitives.
- Default, hover, focus-visible, active/selected, disabled, loading, empty, and error states are handled where applicable.
- Desktop, tablet, 768px mobile, and narrow 360–480px compositions remain usable without scaled-down desktop UI.
- Focus order, accessible names, status text, reduced motion, touch targets, and layout stability remain correct.
- Report files changed, primitives/tokens reused, checks run, and any intentional exception in a compact handoff.
