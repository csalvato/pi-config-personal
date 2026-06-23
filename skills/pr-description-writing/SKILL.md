---
name: pr-description-writing
description: Write or edit pull request descriptions for GitHub, Graphite, or similar PR tools. Use whenever creating, updating, simplifying, or reviewing a PR description/body.
---

# PR Description Writing

Use this skill whenever you write or edit a PR description.

## Goal

Write PR descriptions that are easy to read, clear, and useful to reviewers.

## Style Rules

- Write at about a 7th grade reading level.
- Follow the ideas from *Writing That Works*:
  - Put the reader first.
  - Say the main point early.
  - Use short words and short sentences.
  - Prefer active voice.
  - Be specific.
  - Cut filler, jargon, and vague claims.
  - Make the next action clear.
- Use plain English.
- Avoid internal shorthand unless the reviewer must know it.
- Do not sound like a design doc.
- Do not oversell the change.
- Do not hide risks or tradeoffs.

## Required Shape

Use the repo's PR template when one exists. If there is no template, use this shape:

```markdown
## What

One or two short sentences explaining what changed.

## Why

Explain the problem this PR solves. Keep it concrete.

## How

Explain the important implementation choices. Mention tradeoffs only if they matter for review.

## Testing

List the commands run and any important manual checks.

## Bigger picture

Explain how this PR fits into the larger plan. Keep this short.
```

## Writing Checklist

Before submitting the PR description, check:

- Can a busy reviewer understand why this PR exists in 30 seconds?
- Does the `Why` explain the real problem, not just repeat the `What`?
- Does each section use short paragraphs or bullets?
- Did you remove jargon that is not needed?
- Did you explain how this fits into the larger plan, if there is one?
- Did you include exact test commands?

## Rewrite Pattern

If a description feels too dense, rewrite it like this:

1. Say the change in one simple sentence.
2. Say why it matters in one simple sentence.
3. Add only the details a reviewer needs.
4. Delete the rest.
