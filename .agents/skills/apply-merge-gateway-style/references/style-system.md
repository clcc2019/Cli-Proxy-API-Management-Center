# Merge Gateway style system

This reference is based on the public Merge Gateway page and its published CSS/assets inspected on 2026-07-30. Treat exact values as a coherent starting system, then adapt them to the product and repository.

## Contents

- Visual thesis and color tokens
- Atmosphere, typography, grid, and page hierarchy
- Marketing composition and product surfaces
- Borders, buttons, tabs, and code panels
- Motion, responsive behavior, and quality checks

## Visual thesis

Create a quiet, credible enterprise AI interface. Combine editorial B2B marketing layout with real product UI: warm monochrome foundations, generous negative space, extremely light structure, sparse sage/khaki atmosphere, and a single bright orange attention cue.

Aim for “controlled technical confidence,” not futuristic spectacle.

## Gateway reference calibration

The live Gateway page pairs a pale, low-saturation sage atmosphere with a large editorial hero, then returns immediately to clean white sections. Its embedded product panels are almost entirely white: hierarchy comes from 1px gray rails, compact tab or action strips, warm-charcoal type, and one dark pill CTA. Apply that hero atmosphere only to marketing or destination screens. For dense management pages, borrow the panel grammar instead: one white operational surface, discrete internal dividers, and a single dark primary action. Keep repeated cards white even when their contents differ; use tinted fills only for compact controls or semantic status labels.

## Color tokens

Use semantic names in the implementation. The following values reproduce the observed relationships:

```css
:root {
  --mg-canvas: #ffffff;
  --mg-surface: #ffffff;
  --mg-surface-subtle: #f4f4f4;
  --mg-surface-warm: #faf8f5;
  --mg-text: #2c2a25;
  --mg-text-secondary: #565551;
  --mg-text-tertiary: #807f7c;
  --mg-text-muted: #abaaa8;
  --mg-border: #eaeae9;
  --mg-ink-strong: #0e0d0c;

  --mg-sage: #96a58d;
  --mg-sage-strong: #63725a;
  --mg-sage-soft: #e1e2d9;
  --mg-khaki-soft: #f3f3f0;
  --mg-teal: #274249;
  --mg-orange: #ff6e06;
  --mg-success: #407345;
  --mg-warning: #e5a947;
  --mg-danger: #a53830;

  --mg-radius-control: 8px;
  --mg-radius-medium: 12px;
  --mg-radius-card: 15px;
  --mg-radius-large: 16px;
  --mg-radius-pill: 999px;
  --mg-shadow-card: 0 20px 65px rgb(0 0 0 / 7%);
  --mg-shadow-float: 0 2px 18px rgb(0 0 0 / 6%);
}
```

Apply color with restraint:

- Use `--mg-text` for headings and important data, `--mg-text-secondary` for body copy, and `--mg-text-tertiary` for metadata.
- Use `--mg-border` for nearly all structural strokes. Avoid making borders darker unless showing focus or selection.
- Use sage for selection, contextual surfaces, and calm emphasis.
- Use orange once or twice per viewport, preferably for a CTA detail, progress threshold, eyebrow, or key state.
- Use red, amber, and green only where their state meaning is clear.

## Atmosphere and backgrounds

- Keep most of the page white.
- Build the hero atmosphere from a very pale sage wash fading into white. Use an optional low-opacity contour-line texture at the outer edges, leaving the center calm and readable.
- Use khaki or sage-tinted blocks for a closing CTA or one editorial section, not every section.
- Avoid multicolor gradients. When a gradient is needed for structure, use transparent-to-gray hairlines or sage-to-white haze.

Example hero atmosphere:

```css
.hero-atmosphere {
  background:
    radial-gradient(70% 70% at 50% 0%, rgb(189 199 184 / 55%), transparent 72%),
    linear-gradient(to bottom, rgb(189 199 184 / 28%), #fff 78%);
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

## Grid and spacing

- Use a centered content width around 1196px (`74.75rem`) for marketing and editorial compositions.
- For authenticated management screens with dense tables, logs, charts, or configuration controls, inherit the application shell's available width. Prefer `max-width: none` or a product-specific wide cap after accounting for the sidebar and shell gutters.
- Use 40px page gutters on large screens, 24px on tablet, and 20px on phone.
- Use a 4/8px spacing base. Favor 16, 24, 32, 40, 48, 64, 72, 96, and 116px steps.
- Use 96–116px for major section padding on large screens, 72px on tablet, and 60px on phone.
- Use 32px gaps in hero split layouts. Let the text column occupy roughly 50% and the product visual 47%.
- Use visible negative space inside graphics. Do not fill every grid cell.

Avoid compounded width constraints. Calculate the effective content width as the viewport minus the sidebar, shell gutters, and any page-level maximum. Do not center a 1196px marketing container inside an already constrained admin content area when the primary task needs horizontal room.

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
- Use a subtle gradient hairline (`#eaeae9` to `rgb(171 170 168 / 30%)`) for long capability rails when a flat divider feels too mechanical.

## Buttons and pills

Primary button:

- Set height to 50px, horizontal padding to 24px, radius to full pill, font size to 14px, and background to `#0e0d0c`.
- On hover, change only the background to `#565551` over about 400ms. Do not scale.

Secondary button:

- Use white background, charcoal text, and a 1px `#eaeae9` border.
- On hover, use `#eaeae9` background and `#abaaa8` border over about 300ms.

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
