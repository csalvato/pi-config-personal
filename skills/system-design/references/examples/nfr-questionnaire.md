# NFR Extraction Questions

Ask these questions to extract non-functional requirements.
Mark each answer as CONFIRMED or ASSUMED. Flag all assumptions
as open items that need validation with stakeholders.

Don't ask these all at once. Weave them into the conversation
as they become relevant. But make sure every one gets answered
before leaving Phase 2.

## The Questions

### 1. Scale
How many [primary entities] will be active at any given time?
Thousands? Hundreds of thousands? Millions?

*Follow-up:* What's the current volume? What's the 1-year projection?
Is there an event (new product launch, acquisition) that could spike this?

### 2. Latency
When [trigger event] happens, how quickly must the first action execute?
Seconds? Minutes? Hours? Is batch processing acceptable?

*Follow-up:* Is there a part of the system where real-time matters
and another part where batch is fine? (Often the answer is yes.)

### 3. Availability
Is this a "sleep through the night" system or a "page me at 3am" system?
What breaks if it's down for an hour? For a day?

*Follow-up:* Are there downstream systems that depend on this being up?
What happens to them if this system is unavailable?

### 4. Durability
What happens if we lose data? Is any of it reconstructible from upstream?
What data is the system of record for vs. what is it just caching?

### 5. Ordering
Do operations need to execute in strict order? Or is eventual consistency
acceptable? What happens if two actions run out of order?

### 6. Auditability
Do we need a complete audit trail of every action and state change?
Is this for compliance/regulatory reasons or just for debugging?

*Follow-up:* How long must audit records be retained?

### 7. Multi-tenancy
Does this system serve one product or many? If many, do they share
infrastructure or need isolation? Can one product's load affect another?

### 8. Extensibility
How often do we expect the process/workflow to change?
Weekly? Monthly? Quarterly? Who makes those changes?

*Follow-up:* Do changes require code deploys or can they be made
through configuration?

## Recording the Answers

For each NFR, capture three things in a table:

| Requirement | Value | Status |
|---|---|---|
| Scale | 100-200K active, design for millions | CONFIRMED |
| Latency | Batch OK, sub-1-hour preferred | ASSUMED |
| Availability | Sleep through the night | ASSUMED |

CONFIRMED = stakeholder gave a definitive answer.
ASSUMED = best guess that needs validation. Add to open questions.
