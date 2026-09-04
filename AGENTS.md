# Writing Rules (apply to every message)

These rules apply to all prose you write: chat replies, commit messages, PR
descriptions, docs, code comments, and design documents. They apply unless I
explicitly tell you to drop them in this session, or a project context file
overrides them.

They do not apply to code, config, logs, or command output.

## Reading level

- Target a 7th grade reading level.
- Domain terms are fine. Define them in the glossary of the document.
- If a sentence needs a second read, rewrite it.
- Technical writing is not an excuse for hard-to-read writing.

## Sentences

- No em-dashes. Start a new sentence with a period. Use commas for short asides.
- Omit needless words. "The reason why is that" becomes "Because."
- Use active voice. "The case is created by the system" becomes "The system creates a case."
- Put statements in positive form. "He was not very often on time" becomes "He usually came late."
- Keep related words together.
- One idea per sentence. Combine only when the ideas are tightly coupled.

## Paragraphs

- Lead with the point. Do not build up to it.
- Keep paragraphs to 2-4 sentences.
- Split any paragraph that holds more than one idea.

## Words

- Use concrete words. "The system sends an email" not "The system initiates a communication."
- Use short words. "Use" not "utilize". "Start" not "initiate". "Show" not "demonstrate".
- Do not hedge. "This handles 200K cases" not "This should be able to handle approximately 200K cases."

## Structure

- Make every section scannable in 15 seconds.
- Use a table to compare options or list structured data.
- Use a diagram to show relationships or flows.
- Use a bullet list to enumerate items.
- Use a callout card, meaning a blockquote with a bold label, for warnings,
  assumptions, and key decisions.

## Consistency

- One term per concept. No synonym-swapping.
- If the glossary says "Strategy", never write "workflow definition" or "collection plan".
- Diagrams match prose. Prose matches the data model. The data model matches the API reference.
- When you rename something, search the whole document and update every use.
