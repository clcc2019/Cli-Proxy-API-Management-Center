# xAI surfaces and data

Use this file for bounded content, repeated data, technical UI, overlays, and feedback. All values inherit from `foundations.md`.

## Contents

- Surface hierarchy
- Cards and feature blocks
- Rows, lists, and tables
- Charts and metrics
- Code and editors
- Chat and composer
- Menus and popovers
- Dialogs and drawers
- Loading, empty, error, toast

## Surface hierarchy

| Level                  | Background       | Border       |    Radius | Shadow        |      Padding |
| ---------------------- | ---------------- | ------------ | --------: | ------------- | -----------: |
| Page canvas            | white            | none         |         0 | none          | layout-owned |
| Warm group             | `#f9f8f6`        | none         |      18px | none          |      18–27px |
| White detail           | white            | 1px 8% black | 13.5–18px | none          |  13.5–22.5px |
| Nested technical group | white/5% neutral | 1px 6–8%     |  9–13.5px | none          |       9–18px |
| Dark technical panel   | `#0a0a0a`        | 1px 6% white |      18px | none          |      18–27px |
| Floating menu          | white            | 1px 8% black |    13.5px | menu shadow   |          9px |
| Modal                  | white or warm    | 1px 8% black |      18px | dialog shadow |    22.5–27px |

Allow at most two visibly rounded surface levels. Do not put a card around every subsection.

## Cards and feature blocks

Apply `content-icons.md` before choosing card contents. Surface specifications govern elements that survive the necessity audit; they do not authorize decorative icons, repeated sublabels, or corner arrows.

### Discovery/summary card

Use warm background, 18px radius, no border/shadow, and 18–27px padding. Use an 18–22.5px medium title, 13.5–15.75px secondary description, and bottom-aligned action. Minimum gap between title and copy is 9px; between content groups is 18px.

### Comparable detail card

Use white, 1px 8% border, 13.5–18px radius, and no shadow. Separate repeated attributes with 1px 6% dividers. Align values and actions across cards. Hover only changes border to 15% when the whole card is interactive.

### Interactive suggestion card

Use white, 1px 8% border, 18px radius, no shadow, 13.5px top and 15.75px remaining padding, 9px internal gap. Do not lift or scale. Observed Chat examples were roughly 267px wide and 175–204px high; treat height as content-driven.

## Rows, lists, and tables

- Header/row labels: 13.5px/18px medium; primary cell: 13.5–15.75px; secondary: 13.5px muted.
- Row minimum height: 40.5px dense, 54px normal, 67.5px with two-line summary.
- Cell inline padding: 13.5–18px. Block padding: 9–13.5px.
- Divider: exactly 1px, 6–8% black. No zebra striping by default.
- Header background: white or 5% neutral; sticky header may use `rgb(255 255 255 / 92%)` with no blur.
- Hover: 5% neutral; selected: 8% neutral with `aria-selected`; never colored wash.
- Trailing actions use 36px icon buttons. Numeric/date columns use tabular figures and stable alignment.
- Use tables for comparable columns and divider-led rows for chronology/heterogeneous summaries. Avoid a card per record.
- Mobile: hide lower-priority columns, horizontally scroll with sticky identity column, or recompose into labeled rows. Do not scale text.

## Charts and metrics

- A routine summary metric is value + label, with delta/unit only when it changes interpretation. Omit category icons, explanatory route sublabels, and generic link arrows.
- Use near-black/gray as the baseline. Reserve orange for one selected series, point, endpoint, or threshold.
- Chart grid: 1px at 4–6% black. Axis/legend: 13–13.5px secondary text. Tooltip: white, 1px 8% border, 10–13.5px radius, menu shadow, 9–13.5px padding.
- Standard operational chart height: 270–360px (**normalized**); preserve a stable skeleton/error height.
- Metric label: 15.75px/22.5px secondary. Primary value: 27–40.5px display with tabular figures. Delta/unit: 13.5px.
- Large analytical card padding: 18–27px. Legend gap: 13.5px; marker: 9px square/circle.
- Do not use rainbow series, glossy gradients, floating KPI mosaics, or unlabeled color-only encoding.

## Code and editors

- Panel: near-black, 18px radius, no shadow, `overflow: hidden` at frame and horizontal scroll inside code body.
- Header rail: minimum 54px, 1px 6% white bottom border, 13.5–18px inline padding.
- Code: 13.5px mono, 18–22.5px line height, 18–27px padding, tab size 2, no wrapping unless content mode requires it.
- Tabs follow dark-panel control specs. Copy/run buttons use 27–36px icon controls.
- Use restrained syntax colors with WCAG-readable contrast. Do not recolor the surrounding application.
- Editor loading, error line, selection, focus, search, and response regions must retain stable geometry.

## Chat and composer

- Use one connected workspace, not floating message cards.
- Composer: white or warm, 1px 8% border, 18px radius, minimum 54px collapsed height, 13.5px padding, 9px gap.
- Attach/settings/send controls: 36×36px; send may use black fill/inverse icon.
- Suggestion grid gap: 13.5–18px; cards follow the suggestion spec above.
- Keep streamed, partial, stopped, retry, attachment, code/markdown, and error states in the same layout.
- Generated-content colors do not change shell colors.

## Menus and popovers

- White background, 1px 8% border, 13.5px radius, menu shadow, 9px outer padding.
- Minimum width equals trigger; preferred operational width 180–288px based on content.
- Option minimum height 36px; 9px block/13.5px inline padding; 9px radius; 9px icon gap.
- Open state strengthens trigger border to 15%. Support arrow keys, typeahead where appropriate, Escape, outside click, collision handling, and focus return.

## Dialogs and drawers

- Overlay: `rgb(10 10 10 / 35%)` (**normalized**), solid; no backdrop blur.
- Dialog width: 450–630px normalized for ordinary tasks; max `calc(100vw - 36px)`; complex editor may reach 900–1080px.
- Panel: 18px radius, 1px 8% border, dialog shadow, 22.5–27px padding.
- Header/body/footer gaps: 18–22.5px. Footer action gap: 9px; align right on desktop, stack/full width when narrow.
- Drawer: white, 1px leading border, no rounded outer edge on mobile. Use full viewport for complex mobile tasks.
- Preserve focus trap/restore, Escape, title association, scroll lock, and destructive-action locking.

## Loading, empty, error, toast

- Skeleton: match final geometry, 5% base and 8% moving highlight; use opacity/translation motion from `motion-interaction.md`.
- Spinner: 18px in controls, 27px in bounded regions; 1.5px stroke; inherit current color.
- Empty: remain inside final data surface; title 18px, copy 13.5–15.75px, one primary action at most.
- Error: inline near failed region; semantic icon/text plus retry where possible. Do not replace an entire page with a generic red card.
- Toast: white 1px bordered 13.5px frame, menu shadow, 13.5–18px padding, maximum 360px, semantic icon and concise text. Do not cover mobile primary actions.
