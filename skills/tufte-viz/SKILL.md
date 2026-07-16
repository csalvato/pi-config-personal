---
name: tufte-viz
description: Apply Edward Tufte's principles from The Visual Display of Quantitative Information as the default standard for charts, dashboards, KPI cards, tables, analytical reports, and any visual display of quantitative information. Use when designing a new visualization, critiquing an existing one, reducing chartjunk, choosing between visual forms, laying out small multiples, annotating evidence, or tightening the truthfulness and density of a quantitative display. Default to this skill whenever the task involves showing numbers visually and no better style system is explicitly required.
---

# Tufte Visualization Default

Treat quantitative display as analytical writing, not decoration.

## Operating default

When a task involves numbers on screen or page, default to:

1. maximize information, not ornament
2. preserve graphical integrity
3. use the minimum ink needed for the maximum comparison value
4. integrate words, numbers, and graphics instead of separating them
5. prefer evidence-dense layouts over oversized sparse charts

If the user explicitly wants a branded marketing visual, obey that. Otherwise, start from Tufte.

## Workflow

1. Clarify the analytical question.
   - What comparison matters?
   - What decision should the display support?
   - What level of exactness matters: pattern, ranking, or precise values?

2. Match the form to the comparison.
   - Time series -> line chart, sparkline, or small multiples
   - Rank/compare categories -> bars, dot plot, or table
   - Exact values matter -> table or direct labels
   - Repeated comparison across segments -> small multiples with shared scales
   - Multivariate evidence -> layered plot, table + sparkline, or tightly structured small multiples
   - Part-to-whole -> prefer bars/tables over pie charts unless the pie is genuinely clearer

3. Start plain.
   - Use neutral typography and restrained color.
   - Remove frames, gradients, shadows, and heavy gridlines by default.
   - Prefer direct labels over legends when feasible.

4. Run the eraser test.
   - Delete anything that does not add information, structure, or necessary orientation.
   - Watch for duplicated work: legends plus direct labels, numeric labels plus obvious axis readings, decorative icons, repeated unit text.

5. Run the collision test.
   - Check whether labels, notes, markers, and lines fight for the same space.
   - Move prose into captions or side notes when the plot gets crowded.
   - Use leader lines or dedicated label strips when in-plot labels would collide.

6. Run the integrity test.
   - Avoid distorted baselines unless clearly justified.
   - Keep area/length/position proportional to the underlying values.
   - Avoid 3D, perspective, or icon scaling that changes perceived magnitude.
   - If the visual emphasis overstates the numeric difference, fix it.

7. Finish with evidence-first annotation.
   - Annotate the key comparison, not every point.
   - Put the most useful words as close as possible to the evidence they describe.
   - Prefer concise captions that explain what changed, compared to what, and why it matters.

## Default design rules

- Prefer small multiples over overloaded single charts when repeated comparison is the point.
- Prefer direct labeling over legends.
- Prefer thin reference lines and quiet axes over boxed plotting areas.
- Prefer tables when users need exact lookup.
- Prefer grayscale plus one accent color for emphasis.
- Prefer shared scales across related panels unless a compelling reason exists not to.
- Prefer high data density when readability survives.
- Prefer a compact title that states the finding, not just the topic.
- Prefer showing the baseline/reference context instead of isolated headline values.

## Anti-patterns

Avoid unless the user explicitly asks for them or the evidence demands them:

- 3D charts
- pie/donut charts for fine comparison
- thick borders, gradients, drop shadows, or textured fills
- giant empty canvases with one tiny metric in the middle
- legends far away from the data
- dual-axis charts without strong justification
- excessive decimals, tick marks, or labels that repeat what the eye already knows
- dashboard tiles that show a number without historical or comparative context

## Deliverable standard

When critiquing or designing, explain:

1. the main comparison the display should support
2. the chosen form and why
3. what was removed or kept under the eraser test
4. any integrity risks or lie-factor concerns
5. the final annotation/caption strategy

Read `references/tufte-principles.md` for the core doctrine.
Read `references/default-patterns.md` for default patterns by display type.
