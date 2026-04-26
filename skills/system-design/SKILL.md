---
name: system-design
description: >
  Guide a system design from zero to complete document through a structured
  10-phase process: framing, JTBD, requirements, boundaries, domain model,
  data model, operational flows, implementation, consistency passes, and
  stakeholder artifacts. Use when starting a new system design, resuming
  one in progress, or running a specific phase (e.g. consistency check).
  Maintains a checklist file to track progress across sessions.
---

# System Design Process

A structured process for designing systems from scratch. Derived from
real-world system design sessions that produced production-quality
technical documents.

This process follows Double Diamond design: diverge to explore the
problem space, converge on the right problem, diverge to explore
solutions, converge on the right design. Each phase has explicit
prerequisites and a checklist to track progress.

## First: Initialize or Resume

On every invocation, check if a checklist file exists:

1. Look for `system-design-checklist.md` in the project root
2. If it exists, read it. Report current phase and what's incomplete.
3. If it doesn't exist, ask the user where to initialize, then run:

```bash
bash <skill-dir>/scripts/init.sh <project-root>
```

**The checklist is the source of truth for progress.** Update it after
completing each item. Never mark an item complete without actually doing it.

## How This Process Works

Work through phases in order. Each phase has prerequisites. Do not
advance until all required items in the current phase are checked off.

The user may jump around. That's fine. Update the checklist accordingly.
If the user asks to do something from Phase 7 while in Phase 3, do it,
but flag that earlier phases are incomplete and note which ones.

**At the start of every turn where system design work is happening:**
1. Read the checklist
2. Note what phase you're in and what's left
3. If the user asks "what's next?" — find the first unchecked item

**After completing any item:**
1. Update the checklist immediately
2. Add notes to the Notes section if context is worth preserving

**On compaction:**
- Ensure the summary mentions current phase and checklist location

## The Phases

### Phase 1: Context & Framing

**Goal:** Establish where this system sits in the world.

Before designing anything, you need to know what's around it. What
systems are adjacent? What does this system replace or complement?
What is explicitly out of scope?

Checklist:
- [ ] Identify the broader domain this system belongs to
- [ ] List adjacent systems and bounded contexts
- [ ] Draw a context diagram (Mermaid) showing this system and its neighbors
- [ ] Write the SCQA overview (Situation, Complication, Question, Answer)
- [ ] Establish what this system is NOT (explicit exclusions)

**How:** Ask the user to describe the landscape. Draw the context diagram
early. It grounds every later conversation. The SCQA Answer can be a
placeholder until design is complete. It gets rewritten in Phase 9.

See [references/examples/scqa-example.md](references/examples/scqa-example.md).

---

### Phase 2: Jobs to Be Done

**Goal:** Define what the system does from the perspective of each actor before writing requirements.

Actors are humans, not systems. "Calling system" is really a product owner,
an engineer, a compliance officer. Name the real person behind the system.

Checklist:
- [ ] Identify all actors (human roles, not systems)
- [ ] Write JTBD for each actor: "As a [actor], I want to [action], so that [outcome]"
- [ ] Group JTBD by actor with clear section breaks
- [ ] Share JTBD with user for validation before proceeding

**Why this matters:** JTBD are the source material for requirements and
become the throughline for the entire design. Never finalize functional
requirements before writing and validating JTBD. Requirements are derived
from jobs, not the other way around. If a JTBD can't be satisfied, the
design has a gap.

See [references/examples/jtbd-example.md](references/examples/jtbd-example.md).

---

### Phase 3: Requirements Extraction

**Goal:** Derive what the system must do and how well it must do it from validated JTBD.

Do not ask the user to list requirements. Instead, use the JTBD and ask pointed questions:
- "For this job, when X happens, what should the system do?"
- "Who triggers this? What do they need back?"
- "What's the failure mode if this job can't be completed?"
- "What must be true for this job to feel successful?"

Checklist:
- [ ] Extract functional requirements from validated JTBD via pointed Q&A with the user
- [ ] Map every functional requirement to at least one JTBD
- [ ] Ground key domain terms in industry standards (web search, 3+ sources per term)
- [ ] Build initial glossary with verified terms
- [ ] Extract NFRs using the structured questionnaire
- [ ] Mark each NFR as CONFIRMED or ASSUMED (flag assumptions for validation)
- [ ] Capture buy-vs-build as an open question if commercial alternatives exist

**For every domain term:** search the web for the industry-standard definition.
If the term the user or you use doesn't match industry usage, flag it immediately.
Don't wait. Wrong terminology compounds into wrong mental models.

See [references/examples/nfr-questionnaire.md](references/examples/nfr-questionnaire.md).

---

### Phase 4: Interface & Boundaries

**Goal:** Define how the outside world talks to this system.

For each interface decision, enumerate at least 3 options. State the
principle that narrows the choice. Capture the rationale. Future readers
need to know WHY, not just WHAT.

Checklist:
- [ ] Enumerate interface options (sync API, event-driven, query, hybrid, etc.)
- [ ] Apply bounded context principle: no internals leak through the interface
- [ ] Decide on protocol (REST, gRPC, GraphQL, etc.) with rationale
- [ ] Define resource orientation (what are the nouns?)
- [ ] Document each decision point with options considered and rationale chosen
- [ ] Capture deferred options explicitly (not now, but designed for later)

---

### Phase 5: Architecture & Domain Model

**Goal:** Define the high-level architecture and domain primitives.

Derive primitives from the JTBD, not from implementation instincts.
Every entity should exist because a JTBD demands it. If you can't
point to a JTBD that needs an entity, challenge whether it belongs.

Checklist:
- [ ] Draw high-level architecture diagram (Mermaid)
- [ ] Define each domain primitive (entity name, purpose, relationships)
- [ ] Cross-check every primitive name against industry standards (web search, 3+ sources)
- [ ] Rename any primitive that doesn't align with industry usage (or justify keeping it)
- [ ] Verify: does the domain model satisfy ALL JTBD? (go through each one)
- [ ] Add any missing primitives discovered during verification

---

### Phase 6: Data Model

**Goal:** Translate domain model into concrete storage design.

The data model should fall naturally from the domain model. If it doesn't,
either the domain model is wrong or you're conflating storage concerns
with domain concerns. Fix the domain model first.

Checklist:
- [ ] Derive tables/collections from domain model (1:1 mapping or justified deviation)
- [ ] Define columns/fields for each table with types
- [ ] Challenge every column: "why does this exist? is it redundant?"
- [ ] Add description for each table explaining its purpose (plain language)
- [ ] Verify ERD diagram matches data model tables exactly
- [ ] Validate against org's data infrastructure standards (if applicable)

---

### Phase 7: Operational Flows

**Goal:** Show how the system works end-to-end for every major operation.

Start from a blank, freshly-deployed system. What does someone do first?
Then walk through steady-state operations. Cover the full lifecycle.

Checklist:
- [ ] List all flows (from zero/blank system through steady-state operations)
- [ ] Write sequence diagrams (Mermaid) for each flow
- [ ] Cross-check flows against data model (every read/write touches real tables)
- [ ] Cross-check flows against JTBD (every JTBD has at least one flow)

---

### Phase 8: Implementation Details

**Goal:** Fill in the technology choices and infrastructure.

Every tech choice needs a rationale. "We've always used X" is not a
rationale. "X satisfies our NFRs because..." is.

Checklist:
- [ ] Define tech stack with rationale for each choice
- [ ] Validate each choice against org standards/paved roads (if applicable)
- [ ] Write API reference (resource-oriented, with request/response shapes)
- [ ] Define configuration approach (how is behavior changed without code deploys?)
- [ ] Capture infrastructure requirements (compute, storage, networking)
- [ ] Document activity/action patterns (what the system calls out to, and how)

---

### Phase 9: Consistency & Quality Passes

**Goal:** Make the document internally consistent and readable.

Run these as **independent passes**. Do not combine them. Each pass has
a single focus. Mixing them causes you to miss things.

Checklist:
- [ ] **Consistency pass:** ERD ↔ data model tables ↔ diagrams ↔ prose all match
- [ ] **JTBD satisfaction pass:** every JTBD is satisfied by the design
- [ ] **Readability pass:** grade each section for reading level; simplify hard sections
- [ ] **Redundancy pass:** identify and eliminate duplicate content
- [ ] **Terminology pass:** all terms in glossary; all usage consistent throughout
- [ ] **Rewrite SCQA overview:** now that the Answer is known, make it self-contained

See [references/writing-standards.md](references/writing-standards.md).
See [references/examples/consistency-check.md](references/examples/consistency-check.md).

---

### Phase 10: Stakeholder Artifacts

**Goal:** Create audience-specific deliverables from the design.

Different people need different things from this design. Engineers need
the full technical doc. Product people need the JTBD and configuration
model. Leadership needs a 1-pager on why this matters.

Checklist:
- [ ] Identify audiences (engineers, product, leadership, etc.)
- [ ] Create audience-appropriate artifacts (1-pager, product docs, etc.)
- [ ] Resolve or document all remaining open questions

---

## Open Questions Management

Maintain a running list of open questions in the design document.
When a question gets answered by the design, move the answer into the
relevant section. Do not silently delete open questions. Either answer
them or leave them open with context on what's needed to resolve them.

## Document Format

The primary output is a Markdown file (`system-design.md`). If the user
wants an HTML version with sidebar navigation and Mermaid rendering,
create that as a secondary output kept in sync.

Use Mermaid for all diagrams: context diagrams, architecture, ERD,
sequence diagrams, flow charts.

Use tables for: option comparisons, data model definitions, NFRs,
tech stack choices.
