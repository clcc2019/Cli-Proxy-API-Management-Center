# xAI foundations

Use this file for every task. It is the mandatory source for palette, typography, spacing, geometry, borders, shadows, and layers. Values marked **measured** were observed in computed styles. Values marked **normalized** consolidate repeated observations into a reusable system.

## Contents

- Core token block
- Color roles
- Typography
- Spacing
- Borders and dividers
- Radius
- Shadows and elevation
- Icons
- Layer order
- Exceptions

## Core token block

Install these tokens at the visual root. Do not create legacy aliases except as a temporary migration bridge.

```css
:root {
  color-scheme: light;

  --xai-ink-console: #080808;
  --xai-ink: #0a0a0a;
  --xai-white: #ffffff;
  --xai-inverse: #fafafa;
  --xai-warm: #f9f8f6;
  --xai-secondary: #7d8187;
  --xai-muted: rgb(10 10 10 / 50%);
  --xai-subtle: rgb(10 10 10 / 40%);
  --xai-disabled: rgb(10 10 10 / 30%);
  --xai-fill-soft: rgb(10 10 10 / 5%);
  --xai-fill-hover: rgb(10 10 10 / 8%);
  --xai-fill-pressed: rgb(10 10 10 / 12%);
  --xai-border-cool: #d5d9e2;
  --xai-border-subtle: rgb(10 10 10 / 6%);
  --xai-border: rgb(10 10 10 / 8%);
  --xai-border-hover: rgb(10 10 10 / 15%);
  --xai-orange: #ff640a;
  --xai-success: hsl(132 41% 42%);
  --xai-warning: hsl(44 80% 34%);
  --xai-danger: hsl(353 53% 43%);
  --xai-orange-soft: color-mix(in srgb, var(--xai-orange) 10%, transparent);
  --xai-success-soft: color-mix(in srgb, var(--xai-success) 10%, transparent);
  --xai-warning-soft: color-mix(in srgb, var(--xai-warning) 10%, transparent);
  --xai-danger-soft: color-mix(in srgb, var(--xai-danger) 10%, transparent);
  --xai-orange-border: color-mix(in srgb, var(--xai-orange) 28%, transparent);
  --xai-success-border: color-mix(in srgb, var(--xai-success) 28%, transparent);
  --xai-warning-border: color-mix(in srgb, var(--xai-warning) 28%, transparent);
  --xai-danger-border: color-mix(in srgb, var(--xai-danger) 28%, transparent);
  --xai-code: #0a0a0a;

  --xai-space-1: 4.5px;
  --xai-space-1-5: 6.75px;
  --xai-space-2: 9px;
  --xai-space-2-5: 11.25px;
  --xai-space-3: 13.5px;
  --xai-space-3-5: 15.75px;
  --xai-space-4: 18px;
  --xai-space-5: 22.5px;
  --xai-space-6: 27px;
  --xai-space-7: 31.5px;
  --xai-space-8: 36px;
  --xai-space-9: 40.5px;
  --xai-space-12: 54px;
  --xai-space-15: 67.5px;

  --xai-radius-micro: 6.75px;
  --xai-radius-small: 9px;
  --xai-radius-control: 10px;
  --xai-radius-panel: 13.5px;
  --xai-radius-card: 18px;
  --xai-radius-pill: 9999px;

  --xai-border-width: 1px;
  --xai-shadow-button: 0 1px 3px rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%);
  --xai-shadow-menu: 0 12px 36px -18px rgb(0 0 0 / 24%);
  --xai-shadow-dialog: 0 24px 72px -28px rgb(0 0 0 / 28%);

  --xai-font-ui: universalSans, 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  --xai-font-display:
    universalSansDisplay, universalSans, 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  --xai-font-zh-hans:
    'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --xai-font-mono: GeistMono, 'SFMono-Regular', 'Roboto Mono', Menlo, Monaco, Consolas, monospace;
}

html:lang(zh-Hans) {
  --xai-font-ui: universalSans, var(--xai-font-zh-hans);
  --xai-font-display: universalSansDisplay, universalSans, var(--xai-font-zh-hans);
}
```

## Color roles

| Role                         | Value                 | Rule                                                |
| ---------------------------- | --------------------- | --------------------------------------------------- |
| Console strongest ink/action | `#080808`             | headings, active icons, primary button              |
| General/public strongest ink | `#0a0a0a`             | body, headings, dark panel                          |
| Canvas/detail surface        | `#ffffff`             | default page and controls                           |
| Warm grouping surface        | `#f9f8f6`             | discovery, setup, summary, explanation, bounded CTA |
| Secondary Console text       | `#7d8187`             | descriptions, idle navigation, placeholders         |
| Secondary public text        | `rgb(10 10 10 / 50%)` | editorial metadata/body de-emphasis                 |
| Inverse text                 | `#fafafa`             | black actions and panels                            |
| Accent                       | `#ff640a`             | New/Beta or one rare selected signal only           |
| Success                      | `hsl(132 41% 42%)`    | measured healthy/success state only                 |
| Warning                      | `hsl(44 80% 34%)`     | measured warning/quota state only                   |
| Danger                       | `hsl(353 53% 43%)`    | measured failure/destructive state only             |
| Fine border                  | `rgb(10 10 10 / 8%)`  | cards, controls, rows                               |
| Strong/focus-adjacent border | `rgb(10 10 10 / 15%)` | hover/open boundary                                 |

Do not use orange for navigation selection or broad fills. Use success, warning, and danger only for real semantic state. Orange `#ff640a` is also permitted as a compact xAI attention signal. Provider identity or a documented category may retain its official/established foreground when it materially improves scanning; keep ordinary taxonomy neutral and document colors outside this token set. Pair color with visible text, icon, or shape; color must not carry meaning alone.

Use one hue per compact carrier. A capsule/tag may use the matching soft fill and border token with a dot, glyph, or short label; keep label text near-black unless the semantic foreground passes contrast. Never apply semantic fill to a whole page, card, row, navigation item, or utility control, and never introduce pale blue as a structural surface.

### Semantic state mapping

Map the consequence of the state, not the raw boolean:

| Meaning                                            | Color                             | Examples                                                                           |
| -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Healthy, protected, recommended enabled            | `--xai-success`                   | connected, authentication enabled, telemetry required for analysis enabled         |
| Attention, diagnostic, degraded, protection absent | `--xai-orange` or `--xai-warning` | debug enabled, verbose logging enabled, authentication disabled, quota approaching |
| Ordinary inactive/off                              | `--xai-disabled` or secondary ink | optional debug/logging disabled                                                    |
| Failure/destructive                                | `--xai-danger`                    | disconnected failure, invalid credential, destructive confirmation                 |

Use `--xai-orange` for the xAI attention accent and `--xai-warning` when the product specifically communicates warning/quota severity. Provider/category identity is not state: use its documented color consistently across tags, allowed icons, and charts. Do not tint the entire row/card unless a blocking error requires a bounded alert surface.

## Typography

Use licensed `universalSans`, `universalSansDisplay`, and `GeistMono` when supplied or legally available. Otherwise use the token fallbacks; never extract private font files.

For Simplified Chinese, set `lang="zh-Hans"` and use the locale override above instead of relying on incidental browser fallback. The [OpenAI Research index](https://openai.com/zh-Hans-CN/research/index/) observed on 2026-08-17 uses `"OpenAI Sans SC", "OpenAI Sans", "OpenAI Sans Variable Scripts", sans-serif`; its SC face is a normal-style variable font spanning weights 300–700. Treat that split-font technique as implementation evidence, not a license or xAI visual authority. If the target already legally loads `OpenAI Sans SC` or the user supplies an authorized copy, place it first in `--xai-font-zh-hans`; otherwise keep the open/system fallback stack. Never copy or hotlink OpenAI's CDN font files.

| Token/role           | Font    |         Size |        Line |  Weight |  Tracking |
| -------------------- | ------- | -----------: | ----------: | ------: | --------: |
| Operational H1       | display |         27px |        36px |     500 |  -0.675px |
| Operational H2       | display |       22.5px |      31.5px |     500 | -0.5625px |
| H3/card title        | display |         18px |        27px |     500 |   -0.45px |
| Body                 | UI      |         18px |        27px |     400 |         0 |
| Control/nav          | UI      |      15.75px |      22.5px | 400/500 |         0 |
| Compact label/button | UI      |       13.5px |        18px |     500 |         0 |
| Dense nav label      | UI      |         13px |     18.57px |     500 |         0 |
| Compact body         | UI      |       13.5px |  18–21.94px |     400 |         0 |
| Code                 | mono    |       13.5px |   18–22.5px | 400/500 |         0 |
| Editorial H1         | display |       67.5px |      67.5px |     500 | -1.6875px |
| Compact editorial H1 | display |         54px |   54–59.4px |     500 |   -1.35px |
| Editorial H2         | display | 33.75–40.5px | 40.5–49.5px | 400/500 |   -0.02em |

Use 500 as the normal heading emphasis; do not substitute 700–900. Use tabular numbers for prices, dates, quotas, metrics, and tables. Keep normal copy at 55–72ch. Use `text-wrap: balance` on short display headings where supported.

## Spacing

Use only the declared 4.5px-derived tokens for designed gaps and padding. Permitted optical exceptions are 1px borders and intrinsic media dimensions.

| Purpose                         | Values                              |
| ------------------------------- | ----------------------------------- |
| Icon/text and tiny internal gap | 4.5px or 6.75px                     |
| Dense row/control gap           | 9px                                 |
| Compact inline padding          | 9px or 11.25px                      |
| Standard inline padding         | 13.5px                              |
| Large button inline padding     | 18px or 22.5px                      |
| Card internal spacing           | 18px, 22.5px, or 27px               |
| Operational section gap         | 27px, 31.5px, or 40.5px             |
| Editorial section gap           | 54px, 67.5px, 81px, 108px, or 135px |

Do not introduce conventional 8/12/16/24px values in the edited visual scope.

## Borders and dividers

- Use exactly 1px for controls, cards, row dividers, tables, code rails, and focus outlines.
- Default: `1px solid rgb(10 10 10 / 8%)`.
- Very quiet grouping: `1px solid rgb(10 10 10 / 6%)`.
- Hover/open emphasis: `1px solid rgb(10 10 10 / 15%)`.
- Console compatibility hairline: `#d5d9e2`; use only when a cool solid line matches adjacent source UI.
- Dark-panel divider: `1px solid rgb(255 255 255 / 6%)`.
- Never use 2px+ decorative borders. A 2px control edge is allowed only for a required high-contrast accessibility mode.

## Radius

| Radius | Use                                                                |
| -----: | ------------------------------------------------------------------ |
|      0 | text links, flat list/table rows, unframed code tabs               |
| 6.75px | tiny selectors, utility media, compact rectangular controls        |
|    9px | small fields and technical tabs                                    |
|   10px | normal fields, navigation rows, dropdown surfaces                  |
| 13.5px | nested panels, menus, contained detail groups                      |
|   18px | primary cards, workbenches, dialogs, composer, framed media        |
| 9999px | primary/secondary actions, icon circles, segmented controls, chips |

Do not use 18px on every nested element. Do not nest more than two rounded surface levels.

## Shadows and elevation

| Surface                  | Shadow                                 |
| ------------------------ | -------------------------------------- |
| Card/table/row/workbench | `none`                                 |
| Black primary button     | `--xai-shadow-button`                  |
| Menu/popover             | `--xai-shadow-menu` (**normalized**)   |
| Dialog                   | `--xai-shadow-dialog` (**normalized**) |

Use borders and surface contrast before shadow. Never use glow, colored shadow, or card-hover lift.

## Icons

First apply the semantic gate in `content-icons.md`; omission is the default. For icons that pass, use one line-icon family: 18px default, 16px compact, 20px prominent; usually a 24×24 viewBox; `1.5–2px` stroke; `currentColor`; `fill: none`; round caps and joins. Utility/navigation icons are gray when idle, near-black when active, and white when inverse; state, risk, provider, and documented-category icons may use their mapped color. Do not use colored square/circular icon tiles.

## Layer order

Use a small normalized layer scale: content `0`, sticky `10`, dropdown `30`, overlay `40`, dialog `50`, toast `60`. Do not invent feature-local four-digit z-index values.

## Exceptions

Document every value outside this contract beside the implementation. Acceptable reasons are intrinsic media ratio, data-visualization semantics, platform safe area, target viewport, or accessibility. “The old component already used it” is not an exception.
