---
name: apply-merge-gateway-style
description: 'Design, build, restyle, optimize, or audit any frontend page or component in a strict, high-fidelity xAI visual system. Use for React, Vue, Svelte, HTML/CSS, dashboards, settings, tables, forms, dialogs, navigation, cards, charts, editors, chat, documentation, landing pages, or any new/custom interface whenever Codex must apply the typography, palette, spacing, geometry, surfaces, icons, interactions, responsive behavior, and visual discipline of console.x.ai, docs.x.ai, x.ai, or Grok—without forcing the product into a copied xAI page template.'
---

# Reproduce the xAI Frontend System

Use xAI as the sole visual authority for every page and component in scope. Preserve the target application's behavior, information architecture, content meaning, accessibility, and data flow. Do not preserve its previous visual language when it conflicts with this skill. Replace the visual layer—including typography, palette, spacing, geometry, surface hierarchy, icons, states, and motion—with the xAI system described here.

Do not copy the information architecture or section order of an observed xAI page unless it solves the same content problem. The observations are a design grammar and evidence library, not templates. Design the requested interface around its own task, then express every visual decision through the shared xAI grammar.

The goal is the closest reproducible result permitted by available fonts, media, framework, and content. Never claim literal pixel identity without a screenshot comparison. If licensed xAI fonts or brand assets are supplied, use them; otherwise use the metric-compatible fallbacks and original project content described in the references.

## Read the references

Use progressive disclosure. Always read the foundations and verification contract, then load every category touched by the task:

1. Always read [references/foundations.md](references/foundations.md) for the mandatory palette, type scale, spacing, borders, radii, shadows, layers, and token source.
2. Always read [references/content-icons.md](references/content-icons.md) and run its necessity audit before composing UI. It governs information density, copy, labels, metadata, icons, badges, and decorative affordances.
3. Read [references/controls.md](references/controls.md) for buttons, icon buttons, links, inputs, search, selects, tabs, segmented controls, checkboxes, radios, toggles, badges, and progress.
4. Read [references/surfaces-data.md](references/surfaces-data.md) for cards, rows, tables, lists, charts, code, chat, menus, dialogs, toasts, loading, empty, and error surfaces.
5. Read [references/layout-responsive.md](references/layout-responsive.md) for a page, shell, navigation, grid, toolbar, public/editorial layout, or responsive change.
6. Read [references/motion-interaction.md](references/motion-interaction.md) whenever an element is interactive, opens, closes, enters, exits, loads, scrolls, or changes state.
7. Read [references/composition-grammar.md](references/composition-grammar.md) when designing or restructuring a page/section. Use patterns as grammar, never as mandatory templates.
8. Always read [references/verification.md](references/verification.md) before handoff and enforce its computed-style, state, responsive, and screenshot gates.
9. Read [references/observed-evidence.md](references/observed-evidence.md) only to trace a parameter to the captured xAI pages or resolve ambiguity between measured and normalized values.

Do not substitute memory or framework defaults for a referenced parameter. If the applicable reference defines a value, use that value through a shared `--xai-*` token or component variable.

## Select a density context before styling

Do not average the three xAI modes into a generic SaaS aesthetic.

| Context   | Use for                                                         | Governing traits                                                                                                                 |
| --------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Console   | authenticated dashboards and management tools                   | 306px rail, compact 13.5–27px type, white canvas, warm summary cards, fine borders, black pill actions                           |
| Docs      | developer documentation, onboarding, API examples, editors      | 306px rail, warm 18px workbench, editorial explanation, contained near-black code panel                                          |
| Marketing | home, Grok, company, pricing, news, public product storytelling | 54–67.5px display type, long vertical rhythm, alternating black/white/warm fields, media-led sections, CTA band and ruled footer |

These contexts adjust density and scale; they do not create separate design systems. Shared colors, type character, 4.5px rhythm, radii, icons, actions, surfaces, and motion remain consistent. A custom page may combine operational density with a technical workbench or a restrained editorial introduction when its task requires it. Scope context adjustments with `[data-xai-mode]` and never copy an unrelated route structure.

## Implementation workflow

1. Inspect the existing routes, components, state, and responsive behavior. Preserve function, not appearance.
2. Inventory every visible text node, icon, badge, status, metric, section heading, helper line, and action. Apply the necessity test in `content-icons.md`; delete redundant presentation, then map every surviving state, risk, provider/category identity, progress, and data signal to one stable color before changing layout.
3. Model the page from its actual user task: identify information hierarchy, primary action, dominant surface, density, repeated data, technical content, and below-the-fold sequence. Do not start from an observed page name.
4. Install the `--xai-*` token contract from `foundations.md` at the highest visual root. Map legacy variables to it temporarily, then remove conflicting local values from the edited scope.
5. Establish font loading, page grid, shell width, gutters, type scale, surface hierarchy, and border/radius geometry before component polish.
6. Rebuild shared primitives once, then create the task-appropriate composition from those primitives and the pattern grammar. Avoid page-local imitations and one-off values.
7. Implement default, hover, focus-visible, pressed, current/selected, disabled, loading, empty, error, open, and reduced-motion behavior.
8. Recompose for desktop, tablet, and mobile. Do not shrink a desktop canvas.
9. Execute every applicable gate in `verification.md`. Validate at target viewports with computed styles, interaction states, full-page screenshots, and overlay/diff comparison. Scroll every long page in segments before capture so lazy content and below-fold design are included.

## Non-negotiable visual rules

- Use near-black `#080808`/`#0a0a0a`, white, warm `#f9f8f6`, cool gray `#7d8187`, and hairline black-alpha borders as the dominant system.
- Keep page, card, row, navigation, and utility-control surfaces neutral. Use governed color on compact semantic capsules/tags, state or identity icons, short labels, progress, decision-relevant deltas, and chart signals; keep ordinary taxonomy, pure counts, and normal/off/inactive states neutral.
- Use the exact 4.5px-derived spatial rhythm. Fractional values are intentional and must remain centralized in tokens.
- Use medium display headings with negative tracking. Avoid generic bold 700–900 SaaS headings.
- Treat silence and empty space as interface elements. Do not add greetings, slogans, tips, explanatory restatements, decorative labels, redundant section headings, clocks, dates, build metadata, or helper copy unless they change a decision or prevent an error.
- Keep ordinary cards flat. Do not add shadows except to black primary pills and truly floating layers.
- Use 16–20px thin line icons only after the icon passes the semantic gate in `content-icons.md`. Keep utility/navigation icons neutral; color only state, risk, provider, or documented-category icons from their stable mapping. Never add an icon merely to fill space, decorate a card, repeat a text label, or indicate that an entire card is clickable.
- Use pills for principal actions, compact secondary actions, and segmented controls. Use 9–13.5px radii for fields, rows, and nested structures; use 18px for major cards and workbenches.
- Keep navigation selection neutral: gray when idle, near-black when current, with no bright color wash.
- Use dark surfaces only for code, terminal, source, or deliberate black editorial sections.
- Assign semantic state colors from meaning, not boolean value: enabled security/telemetry may be green, enabled debug/logging may be orange, disabled optional diagnostics may be gray, and disabled protection may be orange. Keep color local to a capsule/tag, dot, icon, short label, progress fill, chart signal, or border; use soft semantic fills only on compact carriers and never tint the whole card or row.
- Use restrained 120–240ms transitions. Never scale cards, bounce controls, add glass blur, or use decorative purple/blue AI gradients.
- Do not introduce an arbitrary value when a specified xAI token or component rule applies. Do not mix legacy and xAI styling inside the edited scope.

## Composition rules

- Preserve the product's required content, workflows, routes, and section meaning. Reorder only when it materially improves the user task.
- Establish one dominant surface or narrative per viewport. Use hierarchy, alignment, whitespace, warm grouping, and hairlines before adding more containers.
- Default to one title and one primary action per routine operational viewport. Add a description, subtitle, section heading, icon, badge, or trailing affordance only when removing it would make the task ambiguous, unsafe, or materially slower.
- Choose components by content semantics: tables for comparable columns, divider-led rows for histories, warm cards for discovery/grouping, white bordered cards for comparable details, connected frames for workbenches, and broad fields for editorial storytelling.
- Use observed Dashboard, Models, Usage, Docs, Home, Pricing, and News structures only as examples of these decisions. Never add pricing cards, a news archive, a 306px rail, a code panel, an engineering grid, a CTA band, or a footer merely because an xAI reference page contains one.
- Make a new or unfamiliar component look native to xAI by applying the same token, typography, geometry, icon, surface, state, density, and motion contracts—not by visually quoting an unrelated component.

## Asset and font policy

- Prefer licensed `universalSans`, `universalSansDisplay`, and `GeistMono` files when the user provides them or the target already legally loads them.
- Otherwise use the fallback stacks in `foundations.md`; do not download or extract private font binaries from xAI.
- Use the target product's own logo, copy, imagery, and data unless the user supplies xAI assets and authorizes their use. Reproduce layout, crop logic, contrast, texture, and motion—not protected content by scraping it.
- Implement live UI with semantic HTML, CSS, SVG, canvas/chart libraries, and real state. Do not paste screenshots into interactive surfaces.

## Fidelity gates

Treat `verification.md` as the complete acceptance contract. At minimum, do not call the work complete until all of these pass:

- The interface is immediately recognizable as one coherent xAI system without relying on a logo or copied page content.
- Computed font sizes, line heights, weights, tracking, primary colors, common gaps, control heights, radii, and shell dimensions match the token contract.
- The composition serves the requested page or component rather than mimicking an unrelated reference route; every visual choice is traceable to an xAI token, component rule, or composition principle.
- Long pages have been scrolled fully and lazy-loaded before capture. At the target viewport, compare screenshots and computed styles against the xAI contract; fix high-area errors first: shell, section rhythm, typography, alignment, media crops, and surfaces.
- At 1280, 1024, 768, 480, and 360px, content recomposes without clipped actions, unreadable code, broken focus order, or tiny desktop UI.
- Keyboard navigation, focus visibility, labels, reduced motion, contrast, loading, empty, error, and long-content states remain usable.
- No legacy palette, radius system, shadow language, font scale, decorative icon tiles, or unrelated design-system conventions remain in the edited visual scope.
- No unsanctioned color, spacing, radius, type size, shadow, icon treatment, or interaction pattern remains without a documented content/accessibility reason.
- No blanket grayscale treatment removes meaningful state, risk, provider/category, progress, or chart cues; every retained hue has one stable meaning and a non-color cue.

Report any unavoidable fidelity exception explicitly, especially missing licensed fonts, missing reference media, dynamic content differences, or browser-rendering variance.
