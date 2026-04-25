# Consistency Check Procedure

Run these as five independent passes. Do not combine them.
Each pass has one focus. Mixing them causes you to miss things.

## Pass 1: Structural Consistency

For each entity in the domain model:
1. Does it appear in the ERD diagram?
2. Does it have a corresponding data model table?
3. Are the field names identical across all three (domain model, ERD, table)?
4. Do the relationships match (1:many, many:many, etc.)?
5. Are there entities in the ERD that aren't in the domain model, or vice versa?

If anything doesn't match, fix it. Don't leave a note. Fix it now.

## Pass 2: JTBD Satisfaction

For each JTBD, answer three questions:
1. Which API endpoint serves it?
2. Which operational flow demonstrates it?
3. Which domain primitives enable it?

If any JTBD lacks all three, the design has a gap. Either:
- Add the missing API endpoint, flow, or primitive
- Or flag it as an open question with a note on what's missing

## Pass 3: Diagram-Prose Agreement

For each diagram in the document:
1. Read every label, box, arrow, and relationship
2. Find the corresponding prose description
3. Do they say the same thing?
4. If the diagram shows something the prose doesn't mention, add it to prose
5. If the prose describes something the diagram doesn't show, add it to the diagram

## Pass 4: Terminology

1. Read every term in the glossary
2. Search the full document for each term
3. Flag any place where a synonym is used instead of the glossary term
4. Flag any domain term used in the document that's NOT in the glossary
5. Fix all flags. Add missing terms. Replace synonyms.

## Pass 5: Open Questions Audit

1. Read every open question
2. Is it answered somewhere in the design now? If yes, move the answer
   into the relevant section and mark the question as resolved.
3. Is it still relevant? If not, remove it with a note explaining why.
4. Are there new questions that surfaced during the design but weren't captured?
   Add them.
