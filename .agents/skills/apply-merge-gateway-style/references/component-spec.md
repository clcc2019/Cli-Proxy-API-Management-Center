# xAI component specification

Build the primitives required by the requested interface once in the target framework and compose any page or component from them. Preserve semantic HTML, behavior, and accessibility while replacing legacy appearance. Every applicable visual value must come from the xAI token and state contracts; do not keep a legacy component appearance merely because the component already exists.

## Contents

- State contract
- Buttons and icon buttons
- Navigation and icons
- Fields and selectors
- Cards, lists, and tables
- Tabs, badges, and status
- Code, chat, and data visualization
- Menus, dialogs, and feedback

## State contract

Every interactive primitive must define default, hover, focus-visible, active/pressed, current/selected, disabled, loading/busy, invalid/error, and open/expanded states where applicable. Reserve icon/spinner/error space to avoid layout shift. Use native controls first, associated labels, `aria-current`, `aria-expanded`, `aria-invalid`, `aria-describedby`, and live status only where their semantics are real.

## Buttons and icon buttons

- Primary: near-black fill, `#fafafa` text, 36–40.5px height, 13.5–18px inline padding, 13.5px gap, pill radius, 13.5–15.75px medium label, subtle button shadow.
- Secondary: white/transparent, 1px black-alpha border or ring, black text, pill radius, no shadow.
- Tertiary: transparent, no border; gain only a 5–8% neutral fill on hover.
- Destructive: use red only when the action is destructive, never as a generic secondary style.
- Disabled: reduce ink contrast and remove shadow; retain readable text and explain unavailable actions nearby.
- Loading: retain width, set `aria-busy`, and replace/precede the icon without shifting the label.
- Icon-only: 36px target on desktop, 44px on touch, 16–20px icon, circular or unframed. Always provide an accessible name and tooltip where meaning is not obvious.

## Navigation and icons

When the page needs a persistent Console/Docs rail, use the measured 306px independently scrolling form, 27px outer spacing, and 36px rows. Otherwise apply the same row, icon, color, grouping, and state grammar to the navigation form the content actually needs. Group items with whitespace and small labels, not tinted boxes. Idle icon/text uses `#7d8187`; current uses `#080808` and medium weight. A current row may use a barely visible 5% neutral fill, but no orange/green wash, thick bar, or colored icon tile.

Use inline SVG from one consistent line-icon family:

- 16–20px box; 18px default;
- normally a 24×24 viewBox;
- 1.5–2px stroke, `currentColor`, `fill="none"`, round linecap/linejoin;
- optical alignment within text rows;
- fill only intrinsically filled marks, not every utility icon.

Public header navigation is sparse, can float over media when contrast is controlled, and uses pill actions. On mobile, use a deliberate menu panel and preserve focus trap, Escape, and scroll lock.

## Fields and selectors

- Text/search/number inputs: 36–40.5px height, 9–10px radius or pill for standalone search, 13.5px inline padding, white surface, 1px neutral border, 15.75px text.
- Labels: 13.5px/18px medium. Help and placeholder: `#7d8187`. Error appears adjacent in text, not color alone.
- Hover strengthens the border to 15–18% black. Focus keeps geometry stable and adds the 1px external focus ring.
- Textarea/code input follows the same frame but uses content-appropriate height and mono type for source.
- Select/listbox/popover aligns to its trigger, uses a 10–13.5px radius, white surface, fine border, floating shadow, 36px option rows, checkmark for current, keyboard navigation, and collision-aware placement.
- Checkbox/radio/toggle remain compact and monochrome. Checked/current may be near-black. Green is reserved for actual success status.

## Cards, lists, and tables

Use two card levels:

1. Discovery/summary: warm `#f9f8f6`, 18px radius, no border unless needed, no shadow, 18–27px padding.
2. Comparable detail: white, 1px 6–10% black border, 13.5–18px radius, no shadow, internal dividers.

Anchor repeated card actions to a common bottom baseline. Do not nest a third rounded card level. Hover only changes border/fill when the whole card is interactive; never lift or scale it.

For histories, news, logs, keys, billing records, and compact resources, prefer one flat frame or no outer frame with divider-led rows. Put identity/title and summary left; date, state, value, or action right. Use stable columns and 9–13.5px row gaps.

Tables use a white surface, neutral header, 13.5px labels, tabular numbers, hairline row separators, and a quiet neutral hover. Avoid zebra striping unless density requires it. Keep actions at the trailing edge. At narrow widths, prioritize/hide secondary columns, allow horizontal scroll, or recompose each row into a labeled summary. Keep loading, empty, and error states inside the same geometry.

## Tabs, badges, and status

- Prominent mode/range selectors use a pill rail. Current may be near-black with inverse text or a warm neutral fill with black text.
- Tabs inside a code panel are text-only in the header rail: white current, muted inactive, no colorful underline.
- Feature/category chips are soft neutral pills with black text and compact 13–13.5px type.
- New/Beta is orange text or a fine orange outline. Avoid saturated badge fills.
- Success/warning/failure colors describe state only and always pair with visible text or an accessible label.
- Progress uses a thin neutral track, semantic fill only if meaningful, tabular percentage/reset data, and accessible determinate value.

## Code, chat, and data visualization

Code panels are contained near-black 18px frames with a compact tab/action rail, `GeistMono`-like 13.5px type, restrained accessible syntax colors, and horizontal scrolling. The surrounding page stays light. Copy buttons are quiet icon controls and confirm success without moving content.

Chat uses one connected workbench. The empty state may show a small set of large white 18px suggestion cards with fine borders and no shadow. Keep the composer anchored, 18px rounded, and visually heavier than secondary settings. Preserve streamed/partial messages, retry, code/markdown rendering, attachment progress, errors, and model controls. Colors inside generated content do not recolor the shell.

Charts use charcoal/gray as the baseline and orange for only one selected series, endpoint, or threshold. Keep grids very light, axes compact, units explicit, heights stable, and tooltips keyboard/readout accessible. Use tabular numbers. Do not create rainbow KPI tiles or decorative gradients.

## Menus, dialogs, and feedback

- Menus/popovers: white 10–13.5px frame, 1px border, floating shadow, compact rows, collision handling, outside-click and Escape dismissal, focus return.
- Dialogs: solid dim overlay, white or warm 18px panel, floating shadow, clearly separated title/body/actions, focus trap/restore, scroll lock. Use a full-screen mobile treatment for complex editors or comparison flows.
- Toasts: restrained neutral frame; semantic icon/text for outcomes. Do not cover primary mobile actions.
- Skeletons match final geometry. Spinners belong to bounded regions/actions. Empty states explain absence and offer at most one useful action. Inline errors stay near their failed region.

## Component rejection list

Reject glassmorphism, blurred cards, thick borders, pervasive shadows, gradient buttons, blue focus defaults, colored navigation tiles, huge illustrative icons, nested rounded containers, card hover scaling, rainbow chart/category colors, and generic 12/16/24px Material-style spacing that erases the xAI rhythm.
