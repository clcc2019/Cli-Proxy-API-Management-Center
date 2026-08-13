# xAI composition grammar

Use this reference to design any page or component from its actual content and user task. The named xAI pages are observational evidence for reusable decisions, not layouts to copy. Never add a section, shell, or component merely because it appears on an xAI page.

## Contents

- Decide from content
- Shared composition grammar
- Operational patterns
- Technical patterns
- Editorial patterns
- Reusable finishing patterns
- Observed-page evidence map
- Full-page verification

## Decide from content

Before drawing the interface, answer:

1. What is the user's primary task and primary action?
2. What information is dominant: summary, comparable records, chronological history, configuration, source/code, conversation, analysis, media, or narrative?
3. Which content repeats, and which content deserves a single connected surface?
4. Is the density operational, technical, or editorial?
5. What must remain visible above the fold, and what is the meaningful below-fold sequence?

Before selecting a pattern, run the inventory and necessity test in `content-icons.md`. Composition begins after redundant copy, metadata, icons, badges, and duplicated actions have been removed.

Then select patterns by semantic fit:

| Content need               | xAI composition                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Summary/discovery          | warm 18px groups, medium heading, quiet description, bottom-aligned action             |
| Comparable detail          | white bordered cards or a flat table with aligned attributes                           |
| Repeated history/resources | divider-led rows with identity left and metadata/action right                          |
| Filters plus analysis      | flat filter rail followed by one dominant chart/data surface                           |
| Configuration/form         | focused sections, hairline separation, one black primary action                        |
| Code/source/onboarding     | connected warm workbench with a contained technical panel                              |
| Conversation/prompting     | one connected workspace with anchored composer                                         |
| Public narrative           | large type, broad white/black/warm fields, asymmetric media and controlled long rhythm |
| Plan/capability comparison | aligned warm choices followed by a flat comparison matrix                              |

Combine only patterns required by the content. A settings page does not need a public hero; a marketing page does not need a Console rail; a list does not become cards merely to look designed.

## Shared composition grammar

- Make one task, surface, or narrative dominant per viewport.
- Build hierarchy with type size/tone, alignment, negative space, warm grouping, and hairlines before color or shadow.
- Use warm `#f9f8f6` to group discovery, setup, summary, explanation, or a bounded CTA. Use white plus hairlines for comparable detail and dense records.
- Keep actions close to the content they affect. Use one black pill as the leading action and outlined/tertiary treatment for the rest.
- Keep ordinary page backgrounds white. Use near-black only for technical content or a deliberate editorial contrast chapter.
- Avoid card mosaics. When many items share columns or chronology, join them into a table or divider-led list.
- Align repeated titles, values, metadata, and actions to stable baselines. Use tabular numbers for data.
- Let below-fold order follow the user's reasoning: orient → act/explore → compare/analyze → details/history → next step.

## Operational patterns

### Page header

Use a direct 27px medium title. Put a concise description below only when removing it creates real ambiguity. Align the primary black pill, filters, date controls, or compact utilities to the title rail or immediately beneath it. Do not insert a marketing hero, greeting, slogan, live clock, date, version, or build metadata into routine work unless the task specifically depends on that information.

### Navigation shell

Use a 306px independent rail only when the product genuinely needs persistent multi-group navigation. Otherwise apply the same monochrome navigation state to the existing shell: 36px rows, 18px line icons, gray idle, near-black current, whitespace grouping, and no colored wash. Do not redesign a small embedded component into a full application shell.

### Setup and empty state

Use one warm 18px task surface with icon, strong short instruction, quiet explanation, and one black pill. If the setup includes a preview or sample, place one white bordered detail frame inside; do not recursively nest cards. Empty states stay in the eventual data region so loading/data arrival does not reflow the page.

### Catalog and discovery

Use warm 18px cards only for featured/discovery choices. Keep titles 18–22.5px, descriptions gray, New/Beta sparse orange, and actions bottom-aligned. Put comparable metadata in a second white bordered layer or table. This two-level hierarchy was observed on Models, but applies to any catalog with featured choices plus detailed comparison.

### Data analysis

Start with a flat text-led filter rail. Create one dominant warm analytical surface and subordinate summaries; a 2:1 grid with one large card beside two stacked cards is useful when the data hierarchy supports it, not mandatory. Include metric, period/delta, graph, axes, legend, and units. Continue with breakdown/detail rows. Keep chart color sparse and semantic.

### Tables, lists, and histories

Use flat white space, stable columns, and hairline dividers. Put identity/title and one-line summary left; status, date, value, or action right. Use tables for repeated comparable fields and divider-led rows for chronological or heterogeneous summaries. Avoid a rounded card per record. Preserve loading, empty, error, pagination, bulk action, and narrow-screen alternatives inside stable geometry.

### Settings, billing, credentials, and storage

Group fields by task with compact headings and hairline separators. Use warm summary cards only for balance/quota/setup/plan concepts that need grouping. Mask secrets, keep destructive controls restrained until invoked, make quota progress thin and labeled, and align numeric/account metadata. Do not add decorative gradients or a card around every field.

## Technical patterns

### Connected workbench

Use one 16–18px connected frame for configuration, source, API examples, routing, onboarding, editors, or structured inspection. A warm explanation/context region may sit beside a near-black code/editor region; resource navigation may occupy a narrow adjacent pane. Keep toolbars, tabs, editor, results, and actions visually connected. Stack in source order on mobile.

The Docs overview demonstrates this grammar, but it does not require every workbench to repeat its exact headline, 50/50 split, or calls to action.

### Code and source

Use mono 13.5px type, stable line height, a compact language/action rail, copy/run controls, contained horizontal scrolling, and a response/error region when real. A code panel may be light inside an operational Console or near-black inside a Docs/editorial workbench. Do not turn the whole application dark.

### Chat and prompts

Use one connected conversation region with an anchored 18px composer. Empty chat may contain a small number of large white suggestion cards with hairline borders and no shadow. Keep model/settings controls secondary. Preserve streaming, stop, retry, partial output, attachments, generated markdown/code, and error states without shifting the shell.

## Editorial patterns

### Hero and introduction

Use 54–67.5px medium display type only when the page's purpose is public/editorial. Keep line count short, subcopy gray, and actions black/outlined pills. The hero may be centered, left-aligned, split with media, or statement-led according to content. Do not copy x.ai homepage wording or force every public page into a centered hero.

### Product/media demonstration

Prefer one large demonstration, an asymmetric split, or a deliberately spanned collage over equal generic feature cards. Use 18px frames, intentional crops, tiny labels, and minimal Explore/action affordances. Alternate white editorial space with occasional warm or black chapters only when narrative pacing benefits.

### Metrics and proof

For a small set of major metrics, use oversized black tabular values over an extremely faint engineering grid or aligned ruled field. For dense operational metrics, use joined cells or analysis cards instead. Never add a grid as decoration behind forms or tables.

### Plans and comparison

Warm 18px choice cards may introduce a small number of plans or options, with bottom-aligned actions and only one black recommended action. Put exhaustive comparison in a flat matrix with grouped rows, hairlines, checks/dashes, and aligned headers. For a custom/enterprise offer, an explanatory left column plus small warm capability blocks works when those capabilities are real.

### Long-form archive or updates

Use one featured item and a small recent-media row only if editorial priority supports them. Render a large archive as a divider-led list with title/summary left and date right. This rule comes from News but applies to any long chronological index; it does not require news-specific content or media.

## Reusable finishing patterns

### CTA band

Use one wide warm 18px band near the end of a public/product journey only when there is a genuine next step. Put short editorial copy left and black/outlined actions right. Do not repeat it throughout a page or add it to routine management screens.

### Footer

Use a ruled, light multi-column footer when the product needs broad public navigation. Start with a full-width hairline; place brand/legal content left and plain muted link columns right. A focused app or embedded component may not need this footer.

### Responsive recomposition

Reduce columns, stack connected regions in source order, wrap toolbars, prioritize primary columns, and make code/tables scroll when required. Remove secondary decoration/metadata before meaning or actions. Do not shrink desktop layouts uniformly.

## Observed-page evidence map

Use this map only to find precedent for a design decision:

| Observed source            | Reusable evidence                                                               |
| -------------------------- | ------------------------------------------------------------------------------- |
| Console Dashboard          | task-first warm setup surface with one nested technical detail frame            |
| Models                     | warm discovery layer followed by white comparable detail                        |
| Usage                      | text-led filters, dominant/subordinate analytical hierarchy                     |
| API Keys, Billing, Storage | compact management rows, masked/sensitive state, quota and action discipline    |
| Code and Chat              | connected workbench, anchored action/composer, quiet suggestion surfaces        |
| Docs overview              | warm explanation plus contained near-black code panel                           |
| x.ai home                  | product collage, API/media split, proof metrics, restrained get-started choices |
| Grok and Company           | asymmetric media-led long-form storytelling and black/white contrast chapters   |
| Pricing                    | warm choices, exhaustive flat matrix, custom capability grouping                |
| News                       | featured priority followed by a very long divider-led archive                   |

Do not reproduce an observed source's section order unless the requested content naturally has the same sequence.

## Full-page verification

Scroll by roughly 80% of the viewport, pause for lazy loading, and repeat until document height stabilizes. Return to the top and capture the full page. Inspect top, representative middle regions, final content, CTA/footer if present, and all interactive states. Compare against the xAI token/component contract and the intended task hierarchy—not against the section order of an unrelated reference page.
