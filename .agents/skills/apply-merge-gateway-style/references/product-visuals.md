# Product data and visual surfaces

Create visuals as credible parts of this management console. Prefer live components backed by real data contracts over decorative mockups.

## Delivery choice

| Need | Use |
|---|---|
| Interactive/localized data | React + semantic HTML |
| Trends and distributions | existing Chart.js wrappers and chart utilities |
| Compact trends | existing SVG sparkline |
| YAML/source/diff | existing CodeMirror components |
| Static topology or explanation | accessible SVG with `viewBox` |
| Supplied screenshot | compressed raster with correct alt/decorative treatment |

Do not generate raster UI screenshots when the surface must localize, respond, expose state, or display live data. Never invent a production claim or present sample values as live.

## Shared visual grammar

- Use a white surface, 1px `--mg-border`, 12–15px radius, and little or no shadow.
- Use 12–14px labels, 16–20px key values, tabular numerals, and mono for IDs/timestamps.
- Use one semantic accent per visual; keep axes, grids, secondary series, and metadata neutral.
- Keep final labels readable. Crop or simplify secondary data instead of scaling the whole surface.
- Pair any chart with a visible summary, legend, tooltip semantics, or accessible data alternative.
- Preserve loading, empty, error, and partial-data states in the same frame.

## Dashboard overview

Use one restrained overview card followed by joined metric cells. Place greeting/title and concise description on the left; place time, version, and connection state in a compact divided meta region. Use 32–42px only for the overview title. Keep metric cards joined by 1px rails and use subtle arrow movement only on real links.

## Usage analytics

- Put time range and export/import/refresh actions in the shared page header or toolbar.
- Divide content into summary, trends, analysis, and details with compact section introductions.
- Reuse `USAGE_CHART_COLORS`, `getUsageSeriesColor`, and `buildUsageAreaGradient`; do not create a competing palette in a page.
- Keep success green, failure red, cost amber, and the remaining series muted charcoal/teal tones.
- Use restrained area alpha, light grid lines, clear units, stable chart height, and deferred rendering for below-fold heavy charts.
- On mobile, simplify legends and controls while retaining the decision-driving series and visible summary.

## Provider workbench

Use one bordered two-column frame: 205–224px category/navigation rail and a flexible resource panel. Keep category, header, toolbar, table/list, and details visually connected. Collapse to one column below the established 1199px breakpoint. Provider colors may identify a provider compactly, but must not tint the entire workspace.

## Credentials and quota

Use compact cards or joined rows with provider identity, account/model metadata, actions, and quota state. Progress tracks stay thin; label percentage and reset window. Use warning/red only when thresholds warrant them. Keep batch search/filter controls in a toolbar and card actions stable across loading/refresh.

## Request logs and status timelines

Let the log surface span the shell width. Use a compact filter/action header, stable columns, mono IDs/timestamps, and hairline rows. Pair routed/fallback/failed color with text. For dense status timelines, preserve keyboard access and roving tabindex; do not expose dozens of independent tab stops when a grouped control communicates the same detail.

## Forms, source, and diff editors

Use a focused surface with clear sections and one primary save action. Keep visual/source modes explicit. Reuse CodeMirror for YAML and diff behavior, preserve stable editor height, and keep search/fold/selection behavior. Errors must identify the affected section or line and remain readable outside color.

## Static explanatory SVG

Use SVG only when an actual UI surface cannot explain a topology or flow. Match the console palette and hairline geometry, include a meaningful `title`/`desc` or mark it decorative, and keep essential labels inside a safe responsive inset. Avoid perspective, glow, generic browser chrome, floating-card collages, and marketing illustrations.

## Responsive states

Define desktop, tablet, and mobile compositions. Remove decoration first, then secondary metadata; never remove the primary signal, action, status label, or accessible summary. Preserve source/focus order even when columns stack or crop.
