---
name: pr-review
description: Review a pull request against a fixed set of quality lenses (bugs, traceability, minimalism, craftsmanship, readability, documentation, evergreen comments). Use whenever asked to review, critique, evaluate, or give feedback on a PR, diff, or branch of code changes.
---

# PR Review

> **Reference copy, not installed.** This is a generic version of a work skill, kept for
> posterity. Nothing here is employer-specific. It is not wired into pi and is not meant
> to be used as-is.

Use this skill for any code review of a PR, diff, or branch.

## Before reviewing

1. Get the actual diff with `gh pr diff` and `gh pr view`. Fetching a private repo URL directly returns 404, so always go through the CLI. Graphite URLs contain the PR number; use it with `gh`.
2. Read the surrounding code, not just the diff. A change is only reviewable in context.
3. Read the repo's `AGENTS.md` / `CLAUDE.md` and any `docs/` the change touches, so review comments match project conventions.

## Review lenses

Evaluate the change against each of these, in order. Evaluate against all of them; **report only the ones that produced findings**.

1. **Bugs** — what in this PR may cause bugs directly?
2. **Traceability** — if there is a bug, how difficult would it be to track down?
3. **Minimalism** — there shouldn't be anything extraneous in the PR. If something can be removed or simplified, call it out.
4. **Craftsmanship** — make sure functions/methods are organized and clear. Complexity (cognitive + cyclomatic) should be very small, meaning the code should be clean and broken down. Follow Bob Martin's Clean Code approaches.
5. **Readability** — is the code readable? If there's any way to improve readability, suggest it.
6. **Documentation** — are all the changes documented, complete, accurate, and in the right place? Use Diátaxis to check the form fits the need: tutorial, how-to, reference, explanation. A how-to written as reference helps nobody.
7. **Evergreen comments** — comments are evergreen and say WHY something unusual was done, never WHAT the code does. If the code does not self-express, the fix is a refactor, not a comment: rename it, extract it, or split it.
8. **Test descriptions** — a test name states behavior as a black box, in the reader's language: no class, column, flag, or migration number. `buckets cut on the v0201 boundaries` is wrong; `a business with no reviews is filed separately from one with ten` is right. If the name only makes sense after reading the code, rewrite it.
9. **Lint suppressions** — every new `@Suppress`, `noqa`, `eslint-disable`, or `@SuppressWarnings` is a finding by default, and widening an existing list counts as new. A suppression shipped with the code it silences is near-always the wrong fix: `LongMethod` means extract a function, not annotate one. Accept it only when the rule is genuinely wrong for that site, such as generated code or a framework-mandated signature, and an adjacent comment says why.
10. **Test implementation** — tests assert behavior, not the current implementation. Reject change-detector tests: assertions copied from whatever the code returns, snapshots with no stated expectation, tests that must change when behavior does not. Khorikov calls this resistance to refactoring in *Unit Testing*. Ask of each assertion: if this fails, has something a user cares about broken?
11. **Security** — walk the OWASP Top 10 against the changed lines, weighted toward authorization and untrusted input. Name the attacker and the asset or it is not a finding: "a signed-in user in tenant A can read tenant B's invoices."
12. **Performance** — flag work that scales with data or traffic: a call inside a loop, an unbounded query, a new predicate with no index. Follow Gregg's discipline in *Systems Performance* and state the multiplier. No number, no finding.
13. **Risk** — exposure and blast radius decide what blocks, as Nygard frames them in *Release It!*. Flagged or unreleased code rarely blocks; live money, auth, and data mutations usually do. Report only unmitigated risk: no flag, no rollback, an irreversible migration.

## Output — a change list, not a report

The lenses are a checklist for *thinking*. They are never an output structure. Never emit a section per lens.

Report findings in the session as one flat list, blocking first, one or two lines each:

```
**Blocking**
1. `Foo.kt:120` — problem in one sentence → fix in one sentence.

**Non-blocking**
2. `nit:` `Bar.kt:86` — problem → fix.
```

- Hard cap: 15 findings, ~40 lines total. Over the cap, cut the weakest findings rather than compressing all of them.
- No lens labels, no quoted diffs, no restating what the code does, no recap of what you checked. Silence means clean.
- Long rationale and replacement snippets belong in the posted PR comment, not the session summary.
- State the PR's **purpose** in one line. If the description never says why the change exists, say so and ask.
- Separate **blocking** findings from **non-blocking / nits**. Label nits explicitly as `nit:`.
- **Every finding must end in a specific action to rectify it.** State it as an imperative naming exactly what to change, and give the replacement snippet whenever the fix is code, config, or prose. "This is unclear", "consider revisiting", and "this could be better" are not findings. If you cannot write the action, you do not understand the problem well enough to report it yet — go read more code.
- Do not manufacture feedback to fill space.
- Verify claims before asserting them. Mark anything you could not verify as `unverified:` in the same line.

## Posting

**Do not post the review until the user asks.** Default behavior is to present findings in the session for the user to approve or edit first.

When asked to post:

1. Read what is already there first — `gh api repos/OWNER/REPO/pulls/N/comments`, `.../pulls/N/reviews`, and bot comments on `.../issues/N/comments`. Never re-post a finding a human or bot already made; endorse it in one line instead.
2. Post a single review: `gh api repos/OWNER/REPO/pulls/N/reviews` with `event=COMMENT` and inline `comments[]` pinned to `path` + `line` + `side: RIGHT`. Lines must fall inside a diff hunk, so compute them from the raw diff hunk headers.
3. **Every AI-authored comment must be visibly marked as AI.** The review body starts with `🤖 ` and one line naming the tool, e.g. `🤖 **AI-assisted review** (pi + Claude). Findings verified against the code; treat as reviewer input, not an approval gate.` Never post an unmarked comment that reads as if a human wrote it.
4. Shape every inline comment the same way: 🤖, then `(blocking)` or `(non-blocking)`, then **Finding.** what you see, **Why change it.** the concrete cost, **Recommendation.** the change you want. Inline comments hold the full explanation and any suggested code.
5. Report back only: count posted, what was skipped as duplicate, and the review URL.

**Never push commits, branches, or code changes to someone else's PR.** Reviewing means posting comments. If a fix requires code, describe it in the comment or offer to open a separate branch — do not touch the author's branch.
