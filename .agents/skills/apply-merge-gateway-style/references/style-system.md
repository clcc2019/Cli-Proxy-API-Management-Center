# xAI style system

Use this as the strict implementation contract for any frontend designed with this skill. Values come from computed-style inspection at a 1512×680 CSS-pixel desktop viewport (DPR 2) and full-page captures. Keep exact fractional values in tokens. Unless content, accessibility, or the target viewport makes a documented exception necessary, use these values rather than approximations or legacy design tokens.

## Contents

- Token foundation
- Fonts and typography
- Spacing and geometry
- Shells and page grids
- Surfaces and backgrounds
- Responsive rules
- Motion and fidelity CSS

## Token foundation

```css
:root {
  color-scheme: light;
  --xai-black: #080808;
  --xai-ink: #0a0a0a;
  --xai-white: #fff;
  --xai-inverse: #fafafa;
  --xai-warm: #f9f8f6;
  --xai-neutral-soft: rgb(10 10 10 / 5%);
  --xai-neutral-hover: rgb(10 10 10 / 8%);
  --xai-neutral-pressed: rgb(10 10 10 / 12%);
  --xai-secondary: #7d8187;
  --xai-border-cool: #d5d9e2;
  --xai-border: rgb(10 10 10 / 8%);
  --xai-border-strong: rgb(10 10 10 / 15%);
  --xai-orange: #ff640a;
  --xai-code: #0a0a0a;

  --xai-s-1: 4.5px;
  --xai-s-1-5: 6.75px;
  --xai-s-2: 9px;
  --xai-s-3: 13.5px;
  --xai-s-4: 18px;
  --xai-s-5: 22.5px;
  --xai-s-6: 27px;
  --xai-s-7: 31.5px;
  --xai-s-8: 36px;
  --xai-s-9: 40.5px;
  --xai-s-12: 54px;
  --xai-s-15: 67.5px;

  --xai-r-micro: 6.75px;
  --xai-r-small: 9px;
  --xai-r-control: 10px;
  --xai-r-panel: 13.5px;
  --xai-r-card: 18px;
  --xai-r-pill: 9999px;

  --xai-shadow-button: 0 1px 3px rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%);
  --xai-shadow-float: 0 20px 60px -24px rgb(0 0 0 / 24%);
  --xai-sidebar: 306px;
  --xai-control: 36px;
  --xai-control-large: 40.5px;
  --xai-icon: 18px;
  --xai-page-inline: 27px;
  --xai-transition-fast: 120ms;
  --xai-transition: 180ms;
  --xai-transition-slow: 240ms;
}
```

Do not add a second palette or approximate these with a colorful framework default. Semantic success/warning/error colors may exist for real states, but they are outside the decorative palette.

## Fonts and typography

Use supplied licensed faces through `@font-face`; otherwise use these substitutions:

```css
:root {
  --xai-font-ui: universalSans, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  --xai-font-display: universalSansDisplay, universalSans, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  --xai-font-mono: GeistMono, "SFMono-Regular", "Roboto Mono", Menlo, Monaco, Consolas, monospace;
}
body { font: 400 18px/27px var(--xai-font-ui); color: var(--xai-ink); text-rendering: optimizeLegibility; }
```

| Role | Size / line | Weight | Tracking |
|---|---:|---:|---:|
| Console H1 | 27 / 36px | 500 | -0.675px |
| Console H2 | 22.5 / 31.5px | 500 | -0.5625px |
| Console H3/card title | 18 / 27px | 500–600 | -0.45px |
| Console nav/tab/control | 15.75 / 22.5px | 400–500 | normal |
| Console compact label/button | 13.5 / 18px | 500 | normal |
| Console compact body | 13.5 / 18–21.94px | 400 | normal |
| Public hero H1 | 67.5 / 67.5px | 500 | -1.6875px |
| Docs/News hero H1 | 54 / 54–59.4px | 500 | -1.35px |
| Public section H2 | 33.75–40.5 / 40.5–49.5px | 400 | about -0.02em |
| Docs H2 | 33.75 / 40.5px | 500 | about -0.02em |
| Public/body | 18 / 27px | 400 | normal |
| Code | 13.5 / 18–22.5px | 400–500 | normal |

Use medium weight and size/space contrast, not heavy bold. Set `font-variant-numeric: tabular-nums` on prices, metrics, dates, quotas, tables, and charts. Keep paragraph measure near 55–72ch; large marketing copy may use 12–18 words per line. Use balanced headings where supported.

## Spacing and geometry

- Use only the 4.5px scale for intentional gaps/padding. A 1px border and optical exceptions are allowed.
- Micro icon/text gaps: 4.5–6.75px. Compact rows: 9–13.5px. Controls/cards: 13.5–22.5px. Sections: 31.5–67.5px. Public vertical fields: 81–162px as multiples of 4.5.
- Controls are normally 36px or 40.5px high. Primary compact actions may be about 32px when the composition requires it.
- Major cards/workbenches use 18px radius. Detail cards use 13.5–18px. Fields and row controls use 9–10px. Tiny media/utilities use 6.75–7px. Pills use a true full radius.
- Ordinary cards, tables, and bands have `box-shadow: none`. Black pills use only `--xai-shadow-button`. Menus/modals may use `--xai-shadow-float`.
- Use 1px borders at 6–15% black or the observed cool `#d5d9e2`. Avoid thick outlines and shadow-as-border.

## Contextual shells and page grids

Shells are content-dependent compositions, not mandatory templates. Apply a shell only when the requested interface needs that navigation and information hierarchy. Components embedded in an existing page inherit the surrounding grid while still using every applicable xAI token and component rule.

### Console

When the product requires a full xAI-style persistent Console rail, use `grid-template-columns: 306px minmax(0, 1fr)`. The sidebar independently scrolls and remains white/borderless. At 1512px the content region is roughly 1177–1188px after gutters. Keep page top/inline padding near 27px and use full available width for operational surfaces. Side navigation controls are 36px high; a full-width team selector is approximately 288×36px with 10px radius. Do not add or widen a sidebar for a component-only task or when the content model does not need persistent navigation.

### Docs

When a documentation product requires persistent categorized navigation, use the same 306px stable rail. A technical workbench may use a warm 18px connected frame with explanation/context and a near-black code region. Use only the regions required by the task; do not add code or navigation decoratively.

### Marketing

For a public/editorial task, use a full-width canvas with content aligned to a consistent inner grid. Choose only the required heroes, contrast fields, metrics, demonstrations, comparisons, CTAs, and footer. Prefer broad two-column splits, 12-column alignment, and generous 54–135px section padding where narrative pacing requires it. Do not manufacture sections to resemble a captured route, and do not wrap every section in a centered SaaS card.

## Surfaces and backgrounds

- White is the default Console/Docs canvas. Warm `#f9f8f6` groups summary, discovery, feature, pricing, CTA, or explanation regions.
- Near-black fields are deliberate contrast chapters or code panels; inverse copy is `#fafafa` with muted white-alpha secondary text.
- Engineering grids use two 1px linear gradients at extremely low contrast, aligned to the spacing rhythm:

```css
.xai-grid {
  background-color: var(--xai-white);
  background-image:
    linear-gradient(rgb(10 10 10 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(10 10 10 / 4%) 1px, transparent 1px);
  background-size: 54px 54px;
}
```

- Warm red/orange API media fields are allowed only behind a contained white code card. Keep texture low-frequency and restrained; never use a generic purple/blue AI gradient.
- Images/video use edge-to-edge crops inside 18px frames when framed. Preserve subject focal point with `object-fit: cover` and explicit `object-position`.

## Responsive rules

Use content-driven breakpoints near 1280, 1024, 768, 480, and 360px.

- Below 1024px, reduce public H1 with `clamp(45px, 7vw, 67.5px)`, simplify grids, and move 3–4 columns to two.
- Below 768px, turn 306px rails into an off-canvas drawer, stack workbench/hero splits in source order, make toolbars wrap, and keep 44px touch targets.
- Below 480px, use 18px page gutters (13.5px at 360px if necessary), full-width primary actions where useful, one-column pricing/capability grids, and horizontally scrollable code/table regions.
- Hide secondary metadata before primary actions or meaning. Never scale the whole page or reduce operational text below readable sizes.
- Preserve DOM/focus order through visual rearrangement.

## Motion and fidelity CSS

Transition only `color`, `background-color`, `border-color`, `opacity`, and small `transform` values. Use 120–240ms with a standard ease-out. Hover may change neutral fill/border; press may translate 1px. Do not scale cards or use bounce/spring motion.

```css
:focus-visible { outline: 1px solid var(--xai-black); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
```

Use CSS reset rules deliberately: border-box sizing, inherited font on controls, zero default margins, responsive media, and stable scrollbars. Avoid framework defaults that introduce blue focus rings, gray page fills, 8px radii everywhere, or box shadows.
