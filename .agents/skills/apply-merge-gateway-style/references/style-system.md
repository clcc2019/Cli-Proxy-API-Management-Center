# Current frontend style system

This reference records the CLI Proxy API Management Center's implemented design language. Verify the current source before editing; when documentation and code differ, the repository wins.

## Source map

| Concern | Authority |
|---|---|
| Semantic theme and aliases | `src/styles/themes.scss` |
| SCSS spacing, breakpoints, font stacks | `src/styles/variables.scss` |
| Body, focus, reduced motion, scrollbars | `src/styles/global.scss` |
| App shell, sidebar, page gutters | `src/styles/layout.scss` |
| Global buttons, inputs, cards, badges, modals | `src/styles/components.scss` |
| Shared React primitives | `src/components/ui/` |
| Dashboard overview grammar | `src/pages/DashboardPage.module.scss` |
| Usage/data grammar | `src/pages/UsagePage.module.scss`, `src/components/usage/` |
| Workbench grammar | `src/features/providers/` |

Prefer these shared sources over copying styles from a feature page. Page-local variables may alias global tokens for readability, but must not redefine their semantic roles.

## Visual thesis

Build a quiet, information-dense enterprise console. The shell uses a cool-gray canvas; cards, controls, and panels are white; warm charcoal carries actions and strong data; sage marks selection or persistent context. Most hierarchy comes from spacing, alignment, 1px dividers, typography, and joined surfaces rather than decoration.

The application is intentionally fixed light. `useThemeStore` resolves to `light`; old dark-theme compatibility code is not an invitation to create new dark branches.

## Token contract

Use the established `--mg-*` tokens for new shared styles and the compatibility aliases when extending an existing component that already uses them.

```css
:root {
  --mg-canvas: #f6f8fa;
  --mg-surface: #ffffff;
  --mg-surface-subtle: #f2f5f7;
  --mg-surface-warm: #f8fafc;

  --mg-text: #1f2937;
  --mg-text-secondary: #475569;
  --mg-text-tertiary: #64748b;
  --mg-text-muted: #94a3b8;
  --mg-border: #e2e8f0;
  --mg-border-hover: #cbd5e1;
  --mg-border-strong: #b6c2cf;
  --mg-ink-strong: #111827;

  --mg-sage: #5d914d;
  --mg-sage-strong: #4f8048;
  --mg-sage-soft: #eef2f6;
  --mg-teal: #1f6170;
  --mg-orange: #c2410c;
  --mg-success: #15803d;
  --mg-warning: #9b5b00;
  --mg-danger: #c53a32;

  --mg-radius-control: 8px;
  --mg-radius-medium: 12px;
  --mg-radius-card: 15px;
  --mg-radius-large: 16px;
  --mg-radius-pill: 999px;
  --mg-shadow-rest: 0 1px 2px rgb(15 23 42 / 0.05);
  --mg-shadow-card: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.11);
  --mg-shadow-float: 0 4px 12px -4px rgb(15 23 42 / 0.08), 0 16px 40px -16px rgb(15 23 42 / 0.16);

  --mg-control-height-small: 32px;
  --mg-control-height: 40px;
  --mg-control-height-large: 48px;
  --mg-hit-area: 44px;
  --mg-page-gutter: clamp(20px, 3vw, 40px);
}
```

The spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, and 96px through `--mg-space-*`. Use it before introducing an exception.

### Semantic roles

| Role | Use | Avoid |
|---|---|---|
| Canvas | route background and shell negative space | card grouping |
| Surface | cards, controls, panels, table body | disabled emphasis |
| Subtle/warm surface | hover, selected neutrals, headers, skeletons | whole-page tint |
| Strong ink | primary action and strongest value | selection or status |
| Sage | selected item, active context, switch-on state | every icon or button |
| Teal | informational accent and selected data series | decoration |
| Green/amber/red | healthy, warning, error/destructive state | category variety |
| Orange | scarce threshold or operational warning | default CTA |

Never rely on color alone. Pair status colors with text, icons, position, or accessible state.

## Typography

- Use the existing Inter/system/CJK stack for body and controls; never fetch a new web font for ordinary work.
- Use `--mg-font-display` for management titles, dashboard overview titles, major modal titles, and intentionally editorial metrics.
- Use `--mg-font-mono` for IDs, timestamps, versions, code, logs, and fixed-width technical values.
- Body baseline: 14.5px, 1.55 line height, `-0.003em` tracking.
- Management H1: `clamp(26px, 2.2vw, 32px)`, 650, 1.08 line height, `-0.04em` tracking.
- Dashboard overview H1: `clamp(32px, 3.5vw, 42px)` only.
- Section title: about 20px/700; card title: about 16px/700; labels and table text: 12–14px.
- Use `font-variant-numeric: tabular-nums` for counts, percentages, timestamps, quotas, and chart axes.
- Keep descriptions at 65–72ch and use balanced/pretty wrapping only for headings or short prose.

Do not use marketing-scale 48–74px headings inside the authenticated shell.

## Surface and density

- Keep panels nearly flat. Use `--mg-shadow-rest` on ordinary cards and `--mg-shadow-float` only on dropdowns, popovers, modals, and clearly elevated feedback.
- Use a 15px radius for primary cards/panels, 12px for nested groups and tables, 8px for controls, and pills only for compact statuses/counts.
- Join related metrics or rows with a 1px gap/divider inside one outer frame instead of making every item a floating card.
- Use 14px compact, 14–20px regular, and 16–22px cozy card padding. Dense tables use 10–14px cell padding.
- Let tables, logs, charts, editors, and workbenches span the available shell width.

## Page hierarchy

### Overview

Allow one restrained bordered overview card. Pair a 32–42px title with a compact status/meta region, then lead into joined metric panels and one primary data section. Keep backgrounds white and remove decorative art.

### Management

Use `ManagementPageHeader`: title/context/description on the left and required actions on the right, divided from content by one hairline. Follow with `ManagementToolbar` when search, filters, secondary controls, or batch actions are needed. Make the table, list, log, or card collection the largest mass.

### Workbench

Use one bordered 15px frame with navigation/category rail and resource panel sharing the boundary. Collapse to one column around the feature's established breakpoint; do not turn every subsection into an unrelated card.

### Secondary/edit

Use contextual navigation, a compact title, and a focused form/editor/detail surface. Limit only the readable form content, not the entire page shell.

## Shell and responsive rules

- Desktop sidebar: 192px; collapsed: 64px. Main content remains full width with `clamp(20px, 3vw, 40px)` inline gutters.
- The header is a lightweight floating control layer; navigation and brand ownership remain in the sidebar.
- At 1024px, multi-column grids and toolbars begin simplifying.
- At 768px, the sidebar becomes an off-canvas drawer, page headers/actions stack, touch targets reach 44px, and page content accounts for safe areas.
- At 480px, inline page padding becomes 16px; at 360px it becomes 12px.
- Recompose dense UI: allow horizontal table scrolling, hide only secondary columns with a clear priority, or stack labeled fields. Never scale a desktop surface.
- Preserve DOM order when CSS changes visual layout.

## Motion, focus, and layers

- Use existing motion durations: fast 130ms, base 190ms, slow/emphasized 240ms.
- Use opacity, background/border color, a 1px press, a small 4–8px entrance, or an occasional 1px card lift. Do not scale on hover.
- Use `mg-popover-enter` for anchored surfaces; preserve stable panel dimensions while content changes.
- Honor the global reduced-motion rule and never encode information only in animation.
- Use the existing 1px `--mg-focus-outline` with offset. Do not remove keyboard focus; pointer modality is already handled globally.
- Consume the existing z-index scale. Dropdown/popover placement must escape sticky content; modal popovers sit above modals; toasts remain highest among working UI.

## Anti-patterns

Do not add glass blur, colored glows, heavy shadows, gradient text, thick frames, alternating tinted sections, oversized empty padding, decorative hero illustrations, dense bento mosaics, or local raw colors that duplicate an existing semantic token. Do not add a second theme or component library for a single page.
