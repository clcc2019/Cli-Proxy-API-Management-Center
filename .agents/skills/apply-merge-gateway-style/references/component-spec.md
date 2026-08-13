# Component specification

Use this reference as a state and composition contract. Inspect the canonical implementation before editing it and preserve public props and semantics unless the task requires an API change.

## Canonical ownership

| Primitive | Source of behavior | Source of visual style |
|---|---|---|
| Button | `components/ui/Button.tsx` | global `.btn*` in `styles/components.scss` |
| Card | `components/ui/Card.tsx` | global `.card*` in `styles/components.scss` |
| Input | `components/ui/Input.tsx` | global input/form classes in `styles/components.scss` |
| Modal | `components/ui/Modal.tsx` | global modal classes in `styles/components.scss` |
| Select | `components/ui/Select.tsx` | `Select.module.scss` |
| Table | `components/ui/Table/` | `Table.module.scss` |
| Toggle/checkbox | `components/ui/ToggleSwitch.tsx`, `SelectionCheckbox.tsx` | adjacent modules |
| Page header/toolbar | `ManagementPageHeader.tsx`, `ManagementToolbar.tsx` | adjacent modules |

Extend these sources when a reusable state is missing. Use a feature module only for feature-specific composition.

## Shared state matrix

Implement the applicable states without layout shift: default, pointer hover, focus-visible, active/pressed, selected/checked/current, disabled, loading/busy, invalid/error, empty, and expanded/open.

- Keep native elements and labels. Use ARIA to expose real state, not replace semantics.
- Use at least a 40px visual control and a 44px mobile/touch target where practical.
- Reserve icon, spinner, hint, error, and action space when state changes would otherwise reflow nearby content.
- Keep hover inside `@media (hover: hover) and (pointer: fine)` when it could create sticky touch behavior.
- Associate errors through `aria-invalid` and `aria-describedby`; announce asynchronous status with an appropriate live region.

## Button

- Use `primary` for the single leading action: 40px, 8px radius, charcoal fill, white text.
- Use `secondary` for companion actions: white surface, hairline border, minimal rest shadow.
- Use `ghost` for tertiary or inline actions; do not use it when the hit boundary would be ambiguous.
- Use `danger` only for destructive confirmation or irreversible actions.
- Use `sm` for density, not a smaller height: the current shared component keeps 40px height.
- Keep the built-in loading spinner, disabled behavior, `aria-busy`, and no duplicate submission.
- Allow only the existing 1px pressed translation; do not add hover lift/scale to buttons.

## Input and form fields

- Use `Input` for label, hint, error, affixes, generated IDs, and described-by wiring.
- Keep 40px height, 8px radius, white surface, and 12px horizontal padding; `sm` is 32px only in genuinely dense contexts.
- Use neutral hover borders. Keyboard focus uses the global outline; errors use red border/ring.
- Keep labels above controls, 600 weight, and hints at 13px/1.5.
- Do not encode required, invalid, or disabled state with placeholder text alone.
- Group related fields with spacing or one nested bordered group before adding separate cards.

## Select, popover, and menu

- Use the shared `Select`, not a styled native select or a new menu implementation.
- Keep trigger height 40px, option height 40px, 8px option radius, and 12px dropdown radius.
- Use fixed/portal positioning and collision-aware placement as implemented; keep dropdowns above modal content with `--mg-z-modal-popover`.
- Use subtle surface hover, neutral selected fill, sage selected text, and a visible check/state rather than color alone.
- Preserve arrow-key navigation, Enter/Space selection, Escape dismissal, outside-click behavior, active descendant/labels, and scroll containment.

## Checkbox and toggle

- Use `SelectionCheckbox` for discrete selection and `ToggleSwitch` for an immediate persistent setting.
- Keep checkbox geometry compact but preserve a usable label/hit target.
- Use sage for checked/on state; charcoal belongs to actions.
- Preserve native input focus, disabled semantics, and textual labels. Do not replace state with a decorative colored track.

## Card and joined panels

- Use `Card` for a true bounded unit. Default radius is 15px; `compact` uses 12px/14px padding; `cozy` uses 16–22px padding; `flush` delegates framing to the parent.
- Set `interactive` only when the entire card performs one action and has correct keyboard semantics at the consumer.
- Use a divider-led header for distinct content sections; use `headerFlush` when spacing already communicates hierarchy.
- Prefer a single joined panel with internal dividers for metrics, tables, or workbench regions. Avoid nested card stacks and decorative hover elevation.

## Management page header and toolbar

- Use one H1 per route. Keep context above, count beside the title, and an optional one-line description below.
- Put only route-level actions in the page header. Search, filters, view options, and batch actions belong in `ManagementToolbar`.
- Keep action priority explicit: normally one primary, remaining secondary/ghost.
- At 1100px the header actions stack; at 1024px the toolbar simplifies; at 768px both become a single-column mobile composition with 44px controls.

## Table and dense data

- Use the shared table wrapper: white 12px frame, warm header, 12px header text, 13px body text, hairline rows, 10–14px padding.
- Use tabular numbers and right alignment for comparable numeric data.
- Keep row hover subtle and selection neutral/sage-contextual. Pair status dots with text.
- Put actions in a stable final column and keep essential identity/status columns visible.
- Provide a labeled scroll region for horizontal overflow. On narrow screens, scroll, prioritize columns, or recompose to labeled summaries; never shrink the entire table.
- Empty, loading, and error rows must preserve table width and explain the next action.

## Modal, secondary screen, and editor

- Use `Modal` for bounded tasks. Preserve focus trap/restoration, Escape behavior, scroll lock, close animation, title labeling, and `closeDisabled` during critical work.
- Keep a 15px floating frame, solid overlay, hairline header/footer, 24px body padding, and warm footer surface.
- Use `fullScreenOnMobile` for complex forms, model lists, diffs, and editors that cannot remain usable in a small centered dialog.
- Use a routed secondary screen when the task needs deep linking, substantial data loading, or more room than a modal.
- Preserve the existing CodeMirror configuration for source/diff editors; do not fake code with a styled textarea.

## Status, badge, progress, and notification

- Use green only for healthy/success, amber for warning/quota, red for failure/destructive, teal for neutral information, and sage for selection/context.
- Pair dots and colored bars with visible text or an accessible name.
- Keep badges compact and border-led. Avoid turning every category into a saturated pill.
- Keep progress determinate when a value exists and expose the value to assistive technology.
- Notifications must state the outcome and avoid covering primary controls on narrow screens.

## Loading, empty, error, and permission states

- Use skeletons when the final geometry is known; match its blocks closely enough to avoid layout shift.
- Use a spinner only for a bounded action or indeterminate region, not as the entire page structure.
- Empty states explain what is absent and offer one relevant action when available.
- Inline errors sit near their failed region; route-level failures use a restrained banner or state panel.
- Disabled is not an explanation. Add concise reason text when users cannot infer why an action is unavailable.

## Navigation and shell

- Preserve the 192px/64px desktop sidebar, grouped navigation, 44px items, active sage context, and off-canvas mobile drawer.
- Keep brand/navigation in the sidebar and utility/connection controls in the lightweight top layer.
- Preserve safe-area insets, backdrop dismissal, body scroll lock, and accessible expanded/current states.
- Avoid feature-specific z-indexes or page containers that fight the shell.

## Verification

Check keyboard-only use, 200% zoom, reduced motion, long translated strings, loading/error transitions, and 1024/768/480/360px compositions. Run the smallest relevant combination of `npm run type-check`, `npm run lint`, and `npm run build`; do not use `agent-browser` unless explicitly requested.
