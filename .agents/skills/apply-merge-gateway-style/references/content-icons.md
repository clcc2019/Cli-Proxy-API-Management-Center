# xAI content and icon discipline

Use this file for every task before layout composition. xAI's restraint comes from deciding what deserves to exist, not merely styling a large amount of content in black and white. Restraint is information hierarchy, not information starvation: preserve the minimum complete set needed to understand, diagnose, and act on the page's subject.

## Contents

- Necessity test
- Operational content budget
- Copy rules
- Metadata and status
- Icon gate
- Metrics, cards, and rows
- Responsive reduction
- Implementation audit

## Necessity test

Inventory every visible text node, icon, badge, divider, status, helper, and action. Keep an item only when at least one answer below is yes:

1. Does it identify the current task or object when the surrounding shell does not?
2. Does it change the user's next decision?
3. Does it expose a real state, risk, error, constraint, or progress condition?
4. Does it enable an action that is not already available nearby?
5. Does it prevent a likely, consequential misunderstanding?

Delete the item if its only purpose is personality, symmetry, visual filling, repetition, or proof that the interface is clickable. Do not retain content because the previous design had it. When uncertain, remove it, inspect the result, and restore only the smallest missing cue.

Run the inverse test before deletion: if removing an element leaves the page unable to answer one of its primary questions, keep or consolidate it. For a dashboard those questions commonly include scale/count, operational configuration, exceptional state, and the next management action. Never reduce a multi-purpose overview to a row of navigation buttons merely because each detail exists on another route.

## Operational content budget

Routine Console pages should begin with:

- one direct H1 naming the task;
- zero or one short description, only for unfamiliar or consequential tasks;
- zero or one primary action;
- one dominant data/task surface;
- only states and metadata needed for the current decision.

Do not stack an eyebrow, greeting, H1, subtitle, helper paragraph, status rail, clock, date, version, and build date in a routine header. A dashboard is not a welcome screen. Prefer `Dashboard` plus a meaningful connection/error state over time-of-day greetings and lifestyle copy.

Section headings are not automatic. Omit a heading when the page title and content geometry already identify the region. Do not use a divider-heading solely to decorate whitespace. Avoid duplicate naming such as `Dashboard` → `System overview` → metric cards when the metrics are the only page content.

An operational first viewport should not repeat navigation destinations as descriptive sublabels. If a metric labeled `API keys` links to API keys, do not add `Configuration management`, a key icon, and a northeast arrow.

### Dashboard coverage floor

A dashboard is a decision surface, not a link directory. Before styling, define its 2–4 primary overview questions and ensure the composition answers them. A management dashboard normally needs:

- an identity/title;
- core counts or health indicators;
- one compact operational/configuration summary when those settings affect behavior;
- exceptional state or failure when present;
- a clear route to deeper management.

Prefer two strong layers—joined summary metrics plus a compact divider-led detail surface—over four bare links or a large grid of small cards. It is valid to surface routing mode, retries, diagnostics, logging, authentication, quota, or proxy state when they explain how the gateway currently behaves. Consolidate those values into aligned rows; do not delete them solely because a settings page also exists.

## Copy rules

- Use nouns for destinations and data: `Models`, `API keys`, `Storage`.
- Use short verbs for actions: `Create key`, `Save`, `Retry`.
- Use sentences only for explanation, errors, irreversible consequences, empty states, and onboarding that truly needs instruction.
- Keep routine labels to one line. Remove filler such as `Welcome back`, `Good evening`, `Here is your overview`, `Quick access`, `Manage your…`, and `Click to…`.
- Do not restate a title in its description. Do not describe visible numbers with a second sentence.
- Do not show empty helper slots. If optional explanation is absent, remove its layout space.
- Tooltips may clarify unfamiliar icon-only actions; they may not hide information required to complete the task.
- Prefer precise dynamic state over generic reassurance. Show `Disconnected` or a concise error, not `Everything is looking great`.

## Metadata and status

- Show global connection state once in the shell or page, not in both.
- Show version/build identifiers only in diagnostics, About, deployment, or when compatibility is relevant. A gateway management dashboard may show a compact backend version beside its operational configuration, but not as a second header status cluster.
- Show date/time only when the task is time-sensitive or the value timestamps data. A live clock is not dashboard content.
- Show status only when it can change interpretation or action. Healthy state may be a compact text/dot; errors need actionable text.
- Judge a state by consequence rather than `true`/`false`: enabled protection can be healthy, enabled diagnostics can require attention, and an ordinary disabled optional feature can remain neutral.
- Use badges for exceptional state, not ordinary taxonomy. Do not badge values already expressed by labels or position.
- Keep secondary metadata out of the first viewport when it belongs in a detail/settings route.

## Icon gate

An icon is allowed only for one of these roles:

1. persistent navigation where repeated scanning benefits from a stable symbol;
2. a conventional compact action such as close, search, copy, reveal, overflow, attach, or send;
3. a state that benefits from redundant non-color encoding, such as warning or failure;
4. a spatial control where words would be slower or wider, such as chevrons in disclosure and previous/next controls;
5. brand identity or real media supplied by the product.

All other icons are rejected by default.

- Do not put icons on metric cards when the number and label identify the metric.
- Do not add arrows to every link or clickable card. Hover, focus, cursor, and semantics already communicate interaction. Use an arrow only when direction or external navigation is itself meaningful.
- Do not pair a familiar text button with a decorative icon. Add an icon only when it materially improves scanning or disambiguates the action.
- Do not use icons as bullets, title ornaments, empty corner decoration, or substitutes for whitespace.
- Do not repeat the same meaning with icon + label + badge + color.
- When an icon is allowed, follow the 16/18/20px monochrome line specifications in `foundations.md`; icon styling does not justify icon existence.

## Metrics, cards, and rows

- A summary metric normally contains only value, label, and an optional decision-relevant delta/unit.
- Do not add category icons, descriptive sublabels, route names, or corner arrows to routine metrics.
- Join related metrics into one warm surface with hairlines. Avoid separate ornamental cards.
- Make the whole metric cell a link only when its destination is unambiguous. Its accessible name should include label and value.
- Keep a compact configuration summary when its values explain current system behavior; move editable controls and exhaustive detail to settings. Dashboard configuration should read as aligned rows, not duplicate the form.
- In rows, keep one identity, one necessary summary, one state/value, and one action. Progressive disclosure owns the rest.
- For compact configuration summaries, use a 6.75–9px semantic dot beside explicit text: green for healthy/recommended, orange for attention/degraded, gray for ordinary inactive, and red for failure. Never replace the text with color.
- Empty state copy should explain why the region is empty or what action resolves it; omit cheerful filler and ornamental illustration by default.

## Responsive reduction

At narrow widths remove, in order:

1. decorative media and decorative icons;
2. repeated descriptions and metadata;
3. redundant section labels;
4. low-priority columns.

Never remove the current task title, consequential state, primary value, error explanation, or required action. Do not replace removed text with unexplained icons.

## Implementation audit

Before handoff, produce an internal inventory for the edited scope and verify:

- every remaining text node has a unique task role;
- every icon maps to an allowed icon role above;
- no title, label, status, value, or action is stated twice;
- no decorative pseudo-element inserts arrows, symbols, or copy;
- no optional content leaves reserved empty height;
- the first viewport communicates the primary task without greetings or filler;
- the page still answers every primary overview question defined before composition and has not collapsed into a link directory;
- removing each remaining element would create a specific usability, safety, or comprehension loss.

If that final loss cannot be named, delete the element.
