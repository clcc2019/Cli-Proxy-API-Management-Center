# xAI controls

Use this file whenever the task touches an interactive control. Measurements are desktop CSS pixels. Mobile touch targets must be at least 44×44px even when the visible control remains smaller.

## Contents

- State contract
- Button sizes and variants
- Icon buttons and links
- Inputs and search
- Select and menu triggers
- Tabs and segmented controls
- Checkbox, radio, toggle
- Chips, badges, progress
- Reference CSS

## State contract

Implement default, hover, focus-visible, pressed, current/selected, disabled, loading, invalid, and open states where relevant. State changes must not change control dimensions. Reserve icon/spinner space. Use native semantics, accessible names, and actual state attributes.

## Button sizes and variants

| Size | Height | Label | Line | Inline padding | Gap | Icon |
|---|---:|---:|---:|---:|---:|---:|
| Compact | 27px | 13.5px/500 | 18px | 9px | 4.5px | 16px |
| Small | 32px | 13.5px/500 | 18px | 13.5px | 6.75–9px | 16px |
| Default | 36px | 15.75px/500 | 22.5px | 13.5px | 6.75px | 18px |
| Large | 40.5/41px | 15.75px/500 | 22.5px | 18px | 9px | 18px |
| Editorial large | 40.5/41px | 15.75px/500 | 22.5px | 22.5px | 9px | 18px |

Use compact only in dense inline contexts. Use 36px by default. Use 41px for principal page actions, large filters, Docs, and public actions. All action buttons use pill radius.

### Primary

- Background and 1px border: `#080808`.
- Text: `#fafafa`.
- Shadow: `--xai-shadow-button`.
- Hover: background/border `#242424`; 150ms.
- Pressed: background `#080808`, `transform: translateY(1px)`; 80–120ms.
- Focus-visible: 1px near-black outline with 3px offset; do not change border width.
- Disabled: `rgb(10 10 10 / 30%)` background, no shadow, no transform, `cursor: not-allowed`.

### Secondary

- Background: transparent or white.
- Text: near-black.
- Boundary: `1px solid rgb(10 10 10 / 15%)`; the measured implementation may use an inset 1px ring.
- Shadow: none.
- Hover: `rgb(10 10 10 / 5%)` fill.
- Pressed: `rgb(10 10 10 / 8%)` fill and 1px downward translation.

### Tertiary and destructive

Tertiary has no border/fill at rest, then a 5% neutral hover. Destructive uses the product's semantic red only for destructive actions and should remain tertiary/secondary until confirmation unless destruction is the primary task.

## Icon buttons and links

- Default icon button: 36×36px, 18px icon, pill radius, no border/fill at rest.
- Compact: 27×27px or 32×32px, 16–18px icon.
- Large/date navigation: 41×41px.
- Hover: 5% neutral fill; pressed: 8% fill; current may use near-black fill with inverse icon.
- Utility text links: 13.5px/18px medium with 4.5px icon gap. No underline at rest; add underline or boundary change on hover where discoverability requires it.

## Inputs and search

| Element | Height | Text | Padding | Radius | Border |
|---|---:|---:|---:|---:|---:|
| Dense input | 36px | 13.5–15.75px | 9px 13.5px | 9–10px | 1px 8% black |
| Default input | 40.5/41px | 15.75px/22.5px | 9px 13.5px | 10px | 1px 8% black |
| Standalone search | 40.5/41px | 15.75px/22.5px | 9px 18px | pill | 1px 15% black |
| Textarea | min 108px | 15.75px/22.5px | 13.5px | 13.5px | 1px 8% black |

Use white/transparent background, near-black input text, and `#7d8187` placeholder. Label is 13.5px/18px medium; help/error is 13.5px/18–21px. Hover border becomes 15% black. Focus retains 1px border and adds the external focus ring. Invalid uses semantic red border plus visible error text and `aria-describedby`; never color alone.

## Select and menu triggers

- Text-led inline filter trigger: 32px high, 15.75px/22.5px, 4.5px block padding, 0 inline padding around text groups, 6.75px icon gap, 6.75px radius; no border/fill at rest.
- Framed select: 36 or 41px high, 13.5px inline padding, 10px radius, 1px 8% border.
- Team/account trigger precedent: 288×36px, 6.75px block/9px inline padding, 9px gap, 10px radius.
- Popup: white, 13.5px radius, 1px 8% border, menu shadow, 9px padding.
- Option: minimum 36px high, 9px block/13.5px inline padding, 9px radius; hover 5%, current 8%, disabled 30% ink.

## Tabs and segmented controls

### Operational pill tabs

Height 36px; 15.75px/22.5px medium; 6.75px block and 13.5px inline padding; 6.75px icon gap; pill radius. Idle text `#7d8187`; current text `#080808` with 5% neutral fill or near-black fill/inverse text when strong selection is required.

### Large/public segments

Height 41px; 15.75px/22.5px medium; 9px block and 22.5px inline padding; pill radius. Use a quiet neutral rail; current is near-black/inverse, idle is 40% black.

### Dark-panel tabs

Use 27px compact tabs: 13.5px/18px, 4.5px block/9px inline padding, 9–13.5px radius. Current is white; idle is `rgb(255 255 255 / 40%)`. Do not use a colored underline.

## Checkbox, radio, toggle

Use normalized implementations where exact controls were not exposed by the collected pages:

- Checkbox/radio visual box: 18×18px, 1px 15% border, 6.75px checkbox radius or pill radio.
- Checked: near-black fill/border and white mark; indeterminate uses a 9px white line.
- Toggle: 36×20px track, 18px knob, 1px inset; off 12% black, on near-black. Translate knob 16px.
- Label gap: 9px; label 15.75px/22.5px; help below at 13.5px.
- Transition: 150ms standard easing. Never use green merely to indicate “on.”

## Chips, badges, progress

- Chip: 27px minimum height, 13–13.5px/18px, 9px inline padding, 4.5px gap, pill radius, 5% neutral fill.
- New/Beta: orange text or 1px orange outline on transparent background; never saturated fill.
- Status badge: compact neutral shell plus semantic dot/text when state is real.
- Progress track: 4.5px high, pill, 8% neutral; semantic or near-black fill. Put value/reset text outside and use native/ARIA progress semantics.

## Reference CSS

```css
.xai-button {
  min-height: 36px;
  padding-inline: 13.5px;
  border: 1px solid var(--xai-ink-console);
  border-radius: var(--xai-radius-pill);
  font: 500 15.75px/22.5px var(--xai-font-ui);
  transition: color 150ms cubic-bezier(.4,0,.2,1), background-color 150ms cubic-bezier(.4,0,.2,1), border-color 150ms cubic-bezier(.4,0,.2,1), transform 120ms cubic-bezier(0,0,.2,1);
}
.xai-button--primary { color: var(--xai-inverse); background: var(--xai-ink-console); box-shadow: var(--xai-shadow-button); }
.xai-button:focus-visible { outline: 1px solid var(--xai-ink-console); outline-offset: 3px; }
```
