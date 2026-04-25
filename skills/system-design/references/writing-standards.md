# Writing Standards

Apply these to every section of the system design document.

## Reading Level

- Target 7th grade reading level for all prose
- Domain-specific terms are fine, but they must be defined in the glossary
- If a sentence requires re-reading to understand, it's too complex. Rewrite it.
- Technical writing is not an excuse for hard-to-read writing

## Style Rules

These come from *The Elements of Style* and *Writing That Works*.

**Sentence construction:**
- No em-dashes. Use periods for new sentences. Use commas for brief asides.
- Omit needless words. "The reason why is that" → "Because."
- Use active voice. "The case is created by the system" → "The system creates a case."
- Put statements in positive form. "He was not very often on time" → "He usually came late."
- Keep related words together
- One idea per sentence, as a default. Combine only when the ideas are tightly coupled.

**Paragraph construction:**
- Lead with the point. Don't build up to it.
- Short paragraphs. 2-4 sentences max for prose sections.
- If a paragraph has more than one idea, split it.

**Word choice:**
- Use concrete words over abstract ones. "The system sends an email" not "The system initiates a communication."
- Prefer short words. "Use" not "utilize." "Start" not "initiate." "Show" not "demonstrate."
- Don't hedge. "This will handle 200K cases" not "This should be able to handle approximately 200K cases."

## Structural Rules

- Every section should be scannable in 15 seconds
- Use tables over prose for comparing options or listing structured data
- Use diagrams over prose for showing relationships or flows
- Use bullet lists over paragraphs for enumerating items
- Use callout cards (blockquotes with bold labels) for warnings, assumptions, and key decisions

## Consistency Rules

- Same term means the same thing everywhere. No synonym-swapping.
- If the glossary says "Strategy," never call it "workflow definition" or "collection plan" in prose
- Diagrams must match prose. Prose must match data model. Data model must match API reference.
- If you update a name in one place, search the entire document and update it everywhere
