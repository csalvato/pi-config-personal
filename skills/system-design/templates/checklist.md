# System Design Checklist

> This file tracks progress through the system design process.
> Updated by the agent as phases are completed.
> Do not edit manually unless correcting an error.

## Current Status: Phase 1 — Not Started

---

## Phase 1: Context & Framing
- [ ] Broader domain identified
- [ ] Adjacent systems / bounded contexts listed
- [ ] Context diagram drawn (Mermaid)
- [ ] SCQA overview drafted
- [ ] Explicit exclusions documented (what this system is NOT)

## Phase 2: Requirements Extraction
- [ ] Functional requirements extracted via Q&A
- [ ] Domain terms grounded in industry standards (3+ sources each)
- [ ] Glossary started with verified terms
- [ ] NFRs extracted via structured questionnaire
- [ ] Each NFR marked CONFIRMED or ASSUMED
- [ ] Buy-vs-build captured as open question (if applicable)

## Phase 3: Jobs to Be Done
- [ ] All actors identified (human roles, not systems)
- [ ] JTBD written for each actor
- [ ] JTBD grouped by actor
- [ ] Every functional requirement maps to ≥1 JTBD
- [ ] User validated JTBD before proceeding

## Phase 4: Interface & Boundaries
- [ ] Interface options enumerated (≥3 per decision point)
- [ ] Bounded context principle applied and documented
- [ ] Protocol decided with rationale
- [ ] Resource orientation defined (the nouns)
- [ ] Each decision documented with options + rationale
- [ ] Deferred options captured explicitly

## Phase 5: Architecture & Domain Model
- [ ] Architecture diagram drawn (Mermaid)
- [ ] Domain primitives defined (name, purpose, relationships)
- [ ] Every primitive cross-checked against industry terms (web search)
- [ ] Non-standard names renamed or explicitly justified
- [ ] Domain model verified against ALL JTBD
- [ ] Missing primitives added after JTBD verification

## Phase 6: Data Model
- [ ] Tables derived from domain model
- [ ] Columns defined with types for each table
- [ ] Every column justified ("why does this exist?")
- [ ] Table descriptions written in plain language
- [ ] ERD matches data model tables exactly
- [ ] Validated against org data standards (if applicable)

## Phase 7: Operational Flows
- [ ] All flows listed (zero-state → setup → steady-state)
- [ ] Sequence diagrams written (Mermaid) for each flow
- [ ] Flows cross-checked against data model
- [ ] Flows cross-checked against JTBD

## Phase 8: Implementation Details
- [ ] Tech stack defined with rationale per choice
- [ ] Validated against org standards / paved roads (if applicable)
- [ ] API reference written (resource-oriented)
- [ ] Configuration approach defined
- [ ] Infrastructure requirements captured
- [ ] Activity / action patterns documented

## Phase 9: Consistency & Quality Passes
- [ ] Consistency pass (ERD ↔ tables ↔ diagrams ↔ prose)
- [ ] JTBD satisfaction pass (every JTBD served)
- [ ] Readability pass (grade each section, simplify as needed)
- [ ] Redundancy pass (eliminate duplicate content)
- [ ] Terminology pass (glossary complete, usage consistent)
- [ ] SCQA overview rewritten with final Answer

## Phase 10: Stakeholder Artifacts
- [ ] Audiences identified
- [ ] Audience-specific artifacts created
- [ ] Open questions resolved or documented with next steps

---

## Notes
<!-- Agent adds context notes here as work progresses -->
