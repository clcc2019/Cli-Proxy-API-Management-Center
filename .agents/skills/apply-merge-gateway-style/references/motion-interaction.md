# xAI motion and interaction

Use this file for every interactive or animated element. xAI motion is quiet, short, and state-explanatory. Values marked measured came from exposed CSS variables; component timelines are normalized implementation rules.

## Contents

- Motion tokens
- Property rules
- Control states
- Enter/exit patterns
- Panels, menus, dialogs, drawers
- Loading and progress
- Scroll behavior
- Reduced motion

## Motion tokens

```css
:root {
  --xai-duration-instant: 80ms;
  --xai-duration-fast: 120ms;
  --xai-duration-default: 150ms; /* measured default */
  --xai-duration-medium: 180ms;
  --xai-duration-slow: 240ms;
  --xai-duration-drawer: 300ms;
  --xai-ease-standard: cubic-bezier(.4,0,.2,1); /* measured */
  --xai-ease-in: cubic-bezier(.4,0,1,1); /* measured */
  --xai-ease-out: cubic-bezier(0,0,.2,1); /* measured */
  --xai-ease-page: cubic-bezier(.22,1,.36,1); /* measured */
}
```

## Property rules

Animate only `color`, `background-color`, `border-color`, `opacity`, and small `transform`. Use `clip-path` only for deliberate editorial reveals and verify performance. Do not animate width/height for routine controls, blur, box-shadow continuously, or use layout-thrashing properties.

Maximum translations: controls 1px, menus/tooltips 4.5px, dialogs/cards on entry 6.75px, editorial reveal 9px. Never scale cards. Icon rotation is allowed only for state-bearing chevrons/spinners.

## Control states

| Change | Duration | Easing | Effect |
|---|---:|---|---|
| Text/icon/fill hover | 150ms | standard | tone/fill only |
| Border hover/focus | 150ms | standard | no color shift for input/search |
| Button press | 80–120ms | ease-out | translateY(1px) |
| Toggle/check state | 150ms | standard | color + knob translation |
| Tab selection | 150ms | standard | text/fill; no sliding spectacle |
| Focus ring | immediate–80ms | ease-out | visible outline, no fade delay |

Pointer hover rules should be inside `@media (hover: hover) and (pointer: fine)` when sticky touch hover would harm use.

## Enter/exit patterns

- Fade: enter 150ms ease-out; exit 120ms ease-in.
- Small reveal: opacity 0→1 and translateY(4.5px→0), 180ms ease-out; exit 120ms ease-in.
- Content section reveal: opacity 0→1 and translateY(6.75–9px→0), 240ms page easing; run once and never block reading.
- Stagger only a small sibling set: 30ms between items, maximum 180ms total. Do not stagger tables, long lists, or essential controls.

## Panels, menus, dialogs, drawers

- Tooltip: 120ms enter, 80ms exit, opacity + 4.5px translation.
- Menu/popover: 150ms enter, 120ms exit, opacity + 4.5px translation. Transform origin follows placement.
- Dialog overlay: 180ms opacity. Dialog: 180ms opacity + 6.75px translation; no scale bounce.
- Drawer: 240–300ms page easing, translate from its edge. Overlay 180ms.
- Accordion/collapse: prefer grid-row `0fr→1fr` or measured height, 180–240ms standard. Preserve content in DOM when accessibility requires it.

## Loading and progress

- Spinner: linear 720ms rotation, infinite; stop when hidden.
- Skeleton shimmer: 1200ms linear, very low contrast (5% base/8% highlight); disable in reduced motion.
- Determinate progress: 240ms standard for value updates; do not animate from zero on every render.
- Streaming text should not fade every token. Use stable text insertion and a quiet caret/status indicator.

## Scroll behavior

Use native scrolling. Smooth programmatic anchor scroll may use 300–500ms browser behavior when user-triggered; disable under reduced motion. Do not hijack wheel/touch scrolling or add scroll-jacking. Sticky headers and rail transitions must remain stable while scrolling.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

Keep state changes immediate and understandable. Do not remove loading/status communication when removing animation.
