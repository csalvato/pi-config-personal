---
name: ste-technical-writing
description: >
  Apply ASD-STE100 (Simplified Technical English) derived writing rules whenever writing or
  editing technical documentation — READMEs, API docs, runbooks, design docs, how-to guides,
  architecture docs, onboarding docs, code comments meant as documentation, or wiki pages.
  Produces clear, unambiguous, non-AI-slop prose. Use PROACTIVELY for any technical
  documentation task, alongside any brand/voice skill that also applies.
---

# STE-derived technical writing

Adapted from ASD-STE100 Simplified Technical English. Apply the **writing rules**, not the
controlled dictionary — the full STE dictionary (~900 approved words) is built for aircraft
maintenance and bans normal software vocabulary. The rules below keep the clarity benefits
without the aerospace constraints.

## Scope

Apply to: READMEs, runbooks, API reference, how-to guides, design docs, architecture docs,
migration guides, incident docs, doc-comments.

Do NOT apply to: marketing copy, UI strings, blog posts with a persuasive goal, or anything
covered by a brand voice guide (that guide wins on conflicts).

## Vocabulary rules

1. **One term, one meaning — one meaning, one term.** Pick one name for each concept and use
   it every time. Never rotate synonyms for variety ("service" / "component" / "system" for
   the same thing is forbidden).
2. **Use exact technical names as-is.** Commands, APIs, config keys, product names are exempt
   from all other rules. Never paraphrase them.
3. **Prefer short, common words.** "use" not "utilize," "start" not "initiate," "make sure"
   not "ensure/verify/validate" (unless "validate" is the precise technical operation).
4. **Verbs do the work.** Prefer verbs over nominalizations: "configure X" not "perform the
   configuration of X."

## Sentence rules

5. **Procedural sentences: ≤ 20 words. Descriptive sentences: ≤ 25 words.** Split anything
   longer.
6. **One instruction per sentence.** In procedures, each step is one action, written as an
   imperative: "Run the migration." not "You should then run the migration and check the logs."
7. **Active voice.** Name the actor: "The scheduler retries the job" not "the job is retried."
   Passive is allowed only when the actor is truly unknown or irrelevant.
8. **Simple tenses only.** Present for behavior, past for events, future for planned work.
   Avoid perfect and progressive forms ("has been running" → "runs" or "started at 09:00").
9. **Keep articles.** Write "the server," not telegraphic "server restarts on failure."
10. **No noun clusters over 3 nouns.** "payment retry queue consumer lag" → "consumer lag on
    the payment retry queue."

## Paragraph and structure rules

11. **One topic per paragraph. ≤ 6 sentences per paragraph.**
12. **Key point first.** State the conclusion or required action, then the rationale.
13. **Use vertical lists** for any sequence of 3+ items or steps. Number steps that must run
    in order.
14. **Warnings before instructions.** State the risk as a command before the step that
    triggers it: "Do not run this against production. Then run: …"

## Anti-slop rules (LLM-specific additions)

15. **No hype adjectives:** powerful, seamless, robust, comprehensive, cutting-edge,
    battle-tested, elegant, blazing-fast. State the measurable property instead, or delete.
16. **No filler transitions:** "Additionally," "Furthermore," "Moreover," "It's worth noting
    that," "In essence." Start with the content.
17. **No rhetorical scaffolding:** "not just X, but Y," "Let's dive in," "the beauty of this
    approach," rule-of-three padding, summary paragraphs that restate the doc.
18. **No hedged non-claims:** "can help improve," "is designed to enable." Say what it does:
    "reduces," "removes," "adds."
19. **Cut every sentence that adds no information.** If deleting a sentence loses nothing,
    delete it.

## Self-check before responding

- Does any concept have two names? Unify.
- Any sentence over the word limit? Split.
- Any passive sentence with a knowable actor? Rewrite active.
- Any adjective you cannot measure? Delete or replace with a number.
- Would a reader who skims only the first sentence of each paragraph still get the doc? If
  not, reorder.

## Conflicts

- Brand/voice skills (e.g. the Block `writing` skill) win on terminology, legal, and blocked
  terms. These rules govern sentence and paragraph mechanics underneath.
- Repo-specific doc conventions (templates, required sections) win on structure.
