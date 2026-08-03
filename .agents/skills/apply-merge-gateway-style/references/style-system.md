# Merge Gateway style system

This reference is based on the public Merge Gateway page and its published CSS/assets inspected on 2026-07-30. Treat exact values as a coherent starting system, then adapt them to the product and repository.

## Contents

- Design-system contract and semantic token architecture
- Visual thesis and color tokens
- Atmosphere, typography, grid, page hierarchy, and responsive modes
- Marketing composition and product surfaces
- Borders, controls, tabs, and code panels
- Interaction, accessibility, motion, and quality checks

## Visual thesis

Create a quiet, credible enterprise AI interface. Combine editorial B2B marketing layout with real product UI: a white canvas, warm charcoal type, generous negative space, extremely light structure, sparse sage/khaki atmosphere, and saturated semantic accents used as deliberate signals.

Aim for “controlled technical confidence,” not futuristic spectacle.

## Gateway reference calibration

The live Gateway page pairs a pale sage atmosphere with a large editorial hero, then returns immediately to clean white sections. Its embedded product panels are almost entirely white: hierarchy comes from 1px gray rails, compact tab or action strips, warm-charcoal type, and one dark pill CTA. Apply that hero atmosphere only to marketing or destination screens. For dense management pages, borrow the panel grammar instead: a white canvas, one white operational surface, discrete internal dividers, and a single dark primary action. Keep repeated cards white even when their contents differ; use more saturated sage, teal, orange, green, amber, or red only for compact controls and semantic status labels.

## Color tokens

Use semantic names in the implementation. The following values reproduce the observed relationships:

```css
:root {
  --mg-canvas: #ffffff;
  --mg-surface: #ffffff;
  --mg-surface-subtle: #f5f5f3;
  --mg-surface-warm: #fbfaf7;
  --mg-text: #2c2a25;
  --mg-text-secondary: #565551;
  --mg-text-tertiary: #74716c;
  --mg-text-muted: #9e9a92;
  --mg-border: #e5e4e0;
  --mg-border-hover: #cbc9c3;
  --mg-border-strong: #b8b6af;
  --mg-ink-strong: #0e0d0c;
  --mg-text-inverse: #ffffff;

  --mg-sage: #5d914d;
  --mg-sage-strong: #4f8048;
  --mg-sage-soft: #eff2ed;
  --mg-sage-wash: rgb(93 145 77 / 12%);
  --mg-sage-wash-soft: rgb(93 145 77 / 5%);
  --mg-khaki-soft: #f4f5f1;
  --mg-teal: #1f6170;
  --mg-orange: #c2410c;
  --mg-success-fill: #16a34a;
  --mg-success-text: #15803d;
  --mg-success: var(--mg-success-text);
  --mg-warning: #9b5b00;
  --mg-danger: #c53a32;
  --mg-surface-selected: #f2f5f0;
  --mg-surface-disabled: #f5f5f3;
  --mg-floating-border: #deddd8;
  --mg-border-fade: rgb(158 154 146 / 28%);
  --mg-overlay: rgb(14 13 12 / 56%);
  --mg-focus-ring: rgb(79 128 72 / 32%);
  --mg-focus-ring-danger: rgb(197 58 50 / 28%);

  --mg-radius-control: 8px;
  --mg-radius-medium: 12px;
  --mg-radius-card: 15px;
  --mg-radius-large: 16px;
  --mg-radius-pill: 999px;
  --mg-shadow-rest: 0 1px 2px rgb(0 0 0 / 7%);
  --mg-shadow-card: 0 20px 65px rgb(0 0 0 / 7%);
  --mg-shadow-float: 0 2px 18px rgb(0 0 0 / 6%);

  --mg-space-1: 4px;
  --mg-space-2: 8px;
  --mg-space-3: 12px;
  --mg-space-4: 16px;
  --mg-space-5: 20px;
  --mg-space-6: 24px;
  --mg-space-8: 32px;
  --mg-space-10: 40px;
  --mg-space-12: 48px;
  --mg-space-16: 64px;
  --mg-space-24: 96px;

  --mg-control-height-small: 32px;
  --mg-control-height: 40px;
  --mg-control-height-large: 48px;
  --mg-hit-area: 44px;
  --mg-content-max: 1196px;

  --mg-motion-fast: 120ms;
  --mg-motion-standard: 240ms;
  --mg-motion-slow: 400ms;
  --mg-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --mg-ease-emphasis: cubic-bezier(0.22, 1, 0.36, 1);

  --mg-z-base: 0;
  --mg-z-sticky: 10;
  --mg-z-header: 20;
  --mg-z-dropdown: 40;
  --mg-z-popover: 50;
  --mg-z-modal: 80;
  --mg-z-toast: 100;
}
```

## Design-system contract

Treat the tokens above as a contract between the page and its primitives:

- Raw color, radius, shadow, spacing, timing, and z-index values belong in the token layer. Component CSS consumes semantic `--mg-*` variables; page-level literals require a documented exception.
- Map an existing product token to this vocabulary when possible. Do not create a second near-duplicate token such as `--border-hover`, `--floating-border`, or `--focus-ring` in a component module.
- Use role tokens by meaning: `--mg-ink-strong` is an action emphasis, `--mg-sage-strong` is selection/context, and `--mg-orange` is a scarce attention cue. Do not swap them merely to create variety.
- Surface hierarchy is primarily `canvas → surface → divider → text`; color fills and shadows are secondary signals. If a hierarchy problem can be solved with spacing or alignment, do that before adding color.
- Keep a single source of truth for each primitive. If a global class and a CSS Module style the same control, converge them before tuning page consumers.

### Semantic role map

| Role | Default token | Use | Do not use for |
|---|---|---|---|
| Canvas | `--mg-canvas` | page background | card grouping |
| Surface | `--mg-surface` | cards, controls, panels | disabled state |
| Subtle surface | `--mg-surface-subtle` | neutral hover, skeletons, tracks | primary navigation |
| Selected surface | `--mg-surface-selected` | selected rows/options/context | decorative tinting |
| Strong ink | `--mg-ink-strong` | primary action, checked controls, code provider selection | persistent on/off state |
| Sage | `--mg-sage-strong` | selected/focused/persistent healthy state | every icon or CTA |
| Orange | `--mg-orange` | one priority/threshold/editorial cue | default button or decoration |
| Border | `--mg-border` | structural hairlines | emphasis outlines |
| Border hover | `--mg-border-hover` | pointer hover and low-emphasis emphasis | permanent dark framing |

Do not use a color as the only carrier of meaning. Pair semantic color with a label, icon, pattern, position, or `aria-*` state.

Apply color with restraint:

- Use `--mg-text` for headings and important data, `--mg-text-secondary` for body copy, and `--mg-text-tertiary` for metadata.
- Use `--mg-border` for nearly all structural strokes. Avoid making borders darker unless showing focus or selection.
- Keep structural surfaces neutral gray-white. Use saturated sage for selection, contextual surfaces, and calm emphasis; keep its pale tint limited to the selected control or status context.
- Use `--mg-success-fill` for determinate fills and chart marks, and `--mg-success-text` for small success labels so the foreground remains readable on white.
- Use orange once or twice per viewport, preferably for a CTA detail, progress threshold, eyebrow, or key state.
- Use red, amber, and green only where their state meaning is clear.

## Atmosphere and backgrounds

- Keep the page canvas and operational surfaces white.
- Build the hero atmosphere from a very pale sage wash fading into white. Use an optional low-opacity contour-line texture at the outer edges, leaving the center calm and readable. Saturate semantic foreground colors rather than tinting the whole page.
- Use khaki or sage-tinted blocks for a closing CTA or one editorial section, not every section.
- Avoid multicolor gradients. When a gradient is needed for structure, use transparent-to-gray hairlines or sage-to-white haze.

Example hero atmosphere:

```css
.hero-atmosphere {
  background:
    radial-gradient(70% 70% at 50% 0%, var(--mg-sage-wash), transparent 72%),
    linear-gradient(to bottom, var(--mg-sage-wash-soft), var(--mg-canvas) 78%);
}
```

## Typography

Use a geometric, slightly characterful display sans for headings. The source uses FH Oscar Pro at 600; use it only when already licensed. Use `Inter`, `Graphik`, or the product's neutral sans for body text. Use `SFMono`, `ui-monospace`, or the existing monospace stack for code and request IDs.

Suggested desktop scale:

| Role | Size | Line height | Tracking | Weight |
|---|---:|---:|---:|---:|
| Hero H1 | 74px | 1.0 | -2.2px | 600 |
| H2 | 64px | 1.0 | -0.03em | 600 |
| H3 | 48px | 1.0 | -1.44px | 600 |
| H4 | 32px | 1.2 | -0.96px | 600 |
| H5 | 24px | 1.3 | -0.72px | 600 |
| H6 | 20px | 1.2 | -0.4px | 600 |
| Subtitle | 20px | 1.5 | normal | 400 |
| Body | 16px | 1.5 | normal | 400 |
| UI label | 12–14px | 1.5 | 0–0.02em | 400–600 |

Scale headings down deliberately: around 64px at tablet, 56px on small tablet, and 40px on phone for the H1. Prefer balanced wrapping and 12–23 character line lengths for display headings. Keep body measure near 45–65 characters.

Typography rules that are easy to verify:

- Use one display family and one reading/UI family at most. Do not mix more than two sans families on one screen.
- Use `font-variant-numeric: tabular-nums` for prices, percentages, counts, timestamps, and table metrics. Use the monospace stack for request IDs, code, and logs only.
- Keep paragraphs between 45 and 65 characters per line where the content is editorial. Management descriptions may be wider when the available shell is already constrained.
- Do not encode hierarchy with font size alone: pair level changes with weight, spacing, and position. Avoid all-caps body copy.
- Use `text-wrap: balance` for short headings and remove forced `<br>` line breaks below the tablet breakpoint unless the break is required by meaning.

### Type roles for product UI

| Role | Size / line-height | Weight | Typical use |
|---|---:|---:|---|
| Management title | 24–32px / 1.15 | 600–650 | page header |
| Panel title | 16–20px / 1.25 | 600–700 | card or surface heading |
| Body | 14–16px / 1.5 | 400 | explanation and content |
| Control label | 13–14px / 1.4 | 500–600 | labels, tabs, toolbar controls |
| Metadata | 12–13px / 1.4 | 400–500 | timestamps, hints, secondary facts |
| Data value | 18–32px / 1.1 | 600–700 | stats, totals, quota values |
| Code / ID | 12–13px / 1.5 | 400–500 | code, logs, request identifiers |

## Grid and spacing

- Use a centered content width around 1196px (`74.75rem`) for marketing and editorial compositions.
- For authenticated management screens with dense tables, logs, charts, or configuration controls, inherit the application shell's available width. Prefer `max-width: none` or a product-specific wide cap after accounting for the sidebar and shell gutters.
- Use 40px page gutters on large screens, 24px on tablet, and 20px on phone.
- Use a 4/8px spacing base. Favor 16, 24, 32, 40, 48, 64, 72, 96, and 116px steps.
- Use 96–116px for major section padding on large screens, 72px on tablet, and 60px on phone.
- Use 32px gaps in hero split layouts. Let the text column occupy roughly 50% and the product visual 47%.
- Use visible negative space inside graphics. Do not fill every grid cell.

Avoid compounded width constraints. Calculate the effective content width as the viewport minus the sidebar, shell gutters, and any page-level maximum. Do not center a 1196px marketing container inside an already constrained admin content area when the primary task needs horizontal room.

### Responsive modes

Use these as behavioral breakpoints, not as a reason to add arbitrary media queries:

| Mode | Viewport cue | Page gutter | Layout behavior |
|---|---:|---:|---|
| Wide desktop | `≥ 1280px` | 40px | marketing max width; multi-column workbenches |
| Desktop | `1024–1279px` | 32px | preserve columns where each primary region remains ≥ 320px |
| Tablet | `768–1023px` | 24px | stack editorial heroes; wrap toolbars; collapse optional nav |
| Phone | `< 768px` | 20px | single column; full-width actions; essential data only |
| Small phone | `≤ 390px` | 16–20px | shorten labels, move actions to rows, never reduce body below 14px |

In every mode:

- Preserve reading order and primary action priority. A visual column may move below its claim, but must not precede the heading in the DOM solely for desktop composition.
- Reduce outer whitespace before reducing text size. Keep body text at least 14px and controls at least 40px visually.
- A row may wrap only at deliberate boundaries. Prevent labels and icon/action pairs from colliding with `min-width`, `flex-wrap`, and overflow rules.
- Use a scroll container for genuinely wide tables/diagrams. Give it an accessible label and a visible affordance when content is clipped.
- Test at both the named breakpoint and about 40px on either side; most real failures occur just before the media query switches.

## Choose the page hierarchy

Treat marketing pages and product-management pages differently while keeping the same color, border, type, and interaction grammar.

For marketing, onboarding, and selected overview pages:

- Use the editorial hero rhythm, display-scale heading, pale sage atmosphere, and generous section spacing when the introduction is a primary part of the experience.
- Keep the hero subordinate to a live product visual when the page is explaining a workflow.

For routine admin pages, logs, tables, settings, and workbenches:

- Use a compact title row with a 24–32px heading, an optional 13–15px one-line description, and only necessary actions.
- Keep the header height content-driven. Avoid decorative borders, large internal padding, contour art, gradients, and card shadows unless the header communicates a critical system state.
- Let the main table, chart, or form become the first large visual surface and consume the available shell width.
- Prefer 16–24px vertical gaps between the title, summary, filters, and operational panel.
- Avoid layering a page-specific entrance animation on top of an application-level route transition.
- Treat repeated management cards as one product surface: use white for their structural background, express grouping through 1px dividers and spacing, and reserve tinted fills for compact controls or actual semantic states. Do not tint an entire card merely because it is disabled, selected, or contains a different kind of data.

## Page composition

Build the page in this rhythm:

1. Place a small pill sub-navigation above a two-column hero.
2. Put an eyebrow, tight H1, concise 1–2 sentence subtitle, and primary/secondary actions in the text column.
3. Put a live-feeling code or product panel in the visual column.
4. Follow with a restrained trust/logo row.
5. Introduce the system with one centered H3 and subtitle.
6. Stack capability rows with text on the left, product visuals on the right, and 1px or subtle gradient dividers between rows.
7. Use a two-column feature section for customer- or tenant-level controls.
8. Use a large code/deployment statement, a demo/case study, a compact FAQ, and a khaki/sage closing CTA.

Do not force this exact sequence when the product has different content. Preserve the rhythm: editorial statement → product proof → operational detail → social proof → action.

## Borders, cards, and elevation

- Use `1px solid var(--mg-border)` as the default boundary.
- Use 15px radius for code windows, dashboard widgets, and embedded product panels.
- Use 8px for inputs and filters, 12px for medium cards, 16px for large marketing cards, and full pills for navigation and actions.
- Use the large card shadow only on major floating panels. Keep most feature imagery border-led and nearly flat.
- Use nested dividers instead of nested shadow boxes.
- Use a subtle gradient hairline (`var(--mg-border)` to `var(--mg-border-fade)`) for long capability rails when a flat divider feels too mechanical.

## Buttons and pills

Use the 40px operational control as the default. The larger values below are for marketing/hero CTAs and must not make dense management toolbars taller.

Primary button:

- For a marketing/hero CTA, set height to 48–50px, horizontal padding to 24px, radius to full pill, font size to 14px, and background to `var(--mg-ink-strong)`. For an operational primary, use the 40px default in [component-spec.md](component-spec.md).
- On hover, change only the background to `var(--mg-text-secondary)` over about 400ms. Do not scale.

Secondary button:

- Use white background, charcoal text, and a 1px `var(--mg-border)` border.
- On hover, use `var(--mg-border)` background and `var(--mg-text-muted)` border over about 300ms.

Segmented/pill navigation:

- Wrap items in a 1px border with 4px inner padding and a full-pill radius.
- Use a white active item and a faint translucent-white or subtle-gray hover state.
- Keep item height near 40px and labels near 14px.

## Tabs and code panels

- Use a white panel with a 1px border, 15px radius, clipped overflow, and the 65px soft shadow.
- Separate the top language tabs with a hairline bottom border.
- Mark the active main tab with charcoal text and a 2px charcoal underline; keep inactive labels gray.
- Use compact provider pills along the panel bottom. Fill the active provider pill charcoal with white text; apply the same fill on hover.
- Use approximately 13px for language tabs, 12px for provider pills, and 12–13px monospace for code.
- Transition tab content in around 300ms and out around 100ms. Prevent panel height shifts.

## Motion and state

- Reveal important elements once on scroll from `translateY(32px)` and opacity 0 to their resting state over 500ms, with 100ms delay and a calm ease.
- Use `translateY(16px)` with 300–400ms delay for subordinate text to create a restrained stagger.
- Keep hover transitions between 200–400ms. Prefer color, opacity, and 1–2px icon movement.
- Change the header background from transparent to opaque when scrolling or opening a dropdown.
- Show copy feedback immediately, hold it around 1200ms, then fade it over 200ms. Announce success with an accessible live region.
- Disable reveal offsets and smooth transitions under `prefers-reduced-motion: reduce`.
- Use clear `:focus-visible` rings. A 2px charcoal or sage ring with 2–3px offset fits the system.

## Interaction and accessibility contract

Every interactive primitive must implement these states where relevant: default, hover (pointer-capable devices only), focus-visible, active/pressed, selected/checked, disabled, loading, invalid/error, and expanded/open. State changes must not depend on color alone and must not move surrounding content.

- **Focus:** never remove the browser outline without replacing it. Prefer `box-shadow: 0 0 0 3px var(--mg-focus-ring)` or an outline with at least 2px contrast against the adjacent surface. Invalid controls use `--mg-focus-ring-danger`.
- **Hit area:** keep a 44×44px interactive target where practical. A 40px visual control may sit inside a 44px button target; do not make icon-only actions smaller than 40px without a documented dense-table exception.
- **Contrast:** target WCAG AA: 4.5:1 for normal text, 3:1 for large text and non-text UI boundaries. Treat tertiary text as metadata, never as the only readable label or instruction.
- **Semantics:** preserve native buttons, inputs, labels, headings, lists, tables, and links. Add ARIA to communicate state, not to replace native semantics. Use `aria-current`, `aria-selected`, `aria-expanded`, `aria-pressed`, `aria-busy`, and `aria-invalid` only when they reflect the actual state.
- **Status:** success, warning, danger, and loading states need text or an accessible name. A colored dot alone is not sufficient.
- **Keyboard:** all controls are reachable in logical DOM order; menus/popovers close with Escape; dialogs restore focus; tabs expose arrow-key behavior; tooltips do not trap focus.
- **Errors:** associate field errors with the field via `aria-describedby` and preserve the hint/error slot so the form does not jump when validation appears. Destructive forms should expose a concise error summary when several fields fail.
- **Motion:** use transform/opacity only for movement and keep the reduced-motion variant static or opacity-only. Never use motion to communicate information that is unavailable in text or state attributes.

## Layering and overflow

Use the z-index tokens instead of local arbitrary values. A sticky header may sit above page content, but dropdowns must sit above sticky content, dialogs above all application surfaces, and toasts above dialogs only when the product explicitly allows feedback during a dialog.

- Establish `position: relative` on the smallest containing block that owns a decorative layer; do not create a new stacking context accidentally with opacity or transform on the page shell.
- Clip decorative art at its frame, not essential copy or focus rings. Use `overflow: clip`/`hidden` only after checking keyboard focus and popover escape paths.
- Anchor popovers to their trigger and use collision-aware placement. Their entrance offset follows the placement direction; never animate an anchored popover from the viewport edge.
- Reserve shadows for elevation changes. One view should normally use at most resting, floating, and dominant-card depths.

## Responsive behavior

- At tablet, stack the hero text above the product panel and center the text/actions when appropriate.
- Convert capability rows from horizontal to vertical. Keep the visual right-aligned or centered and allow intentional edge cropping.
- Reduce structural spacer rows before compressing text.
- On phone, make paired CTA buttons full width, maintain readable labels, and simplify dense product graphics.
- Recompose tables as a scrollable viewport, essential-column view, or summary cards. Do not scale an entire desktop table to illegibility.
- Keep line breaks editorial on desktop but remove forced breaks when they create awkward mobile widows.

## Quality checklist

- Confirm that charcoal, gray, sage, and orange have distinct roles.
- Confirm that most borders are 1px and most surfaces remain white.
- Confirm that headings feel tight while body text remains relaxed.
- Confirm that product visuals communicate an actual workflow or state.
- Confirm that hover does not cause layout shift.
- Confirm contrast, keyboard operation, focus visibility, and reduced motion.
- Confirm every literal used by a component is either a documented exception or represented by a semantic token.
- Confirm the DOM order, heading outline, accessible names, and status text remain correct when the layout stacks on mobile.
- Confirm no hover-only affordance is required to discover, operate, copy, expand, or dismiss content.
- Confirm loading, empty, error, and permission-denied states reserve the same structural slots as their resolved states where possible.
