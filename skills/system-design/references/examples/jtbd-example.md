# JTBD Examples

Jobs to Be Done should name real human actors, not abstract systems.
"Calling system" is really a product owner. "Consumer" is really
a borrower named Maria who missed a payment.

## Format

> As a [specific actor], I want to [action], so that I can [outcome].

The action is what they think they need. The outcome is what they
actually need. These are often different. Pay attention to the gap.

## Example: Collections System

### Loan Product Owner

1. As a **loan product owner**, I want to define a collections strategy
   for my product, so that delinquent loans follow a consistent recovery
   process without my team building custom logic.

2. As a **loan product owner**, I want to place a delinquent loan into
   collections with a single API call, so that my servicing system
   doesn't need to understand collections internals.

3. As a **loan product owner**, I want to run two collection strategies
   side by side, so that I can measure which one recovers more money
   with less borrower friction.

### Compliance Officer

4. As a **compliance officer**, I want to see the exact sequence of
   actions a strategy will take before it runs, so that I can verify
   it meets regulatory requirements for each jurisdiction.

5. As a **compliance officer**, I want an audit trail of every action
   taken on every case, so that I can produce evidence for regulators
   on demand.

### On-Call Engineer

6. As an **on-call engineer**, I want to trace the exact path a case
   took through its workflow, so that I can diagnose why a specific
   borrower received (or didn't receive) a particular notice.

7. As an **on-call engineer**, I want to pause or cancel a case
   without redeploying, so that I can stop a bad strategy from
   affecting more borrowers during an incident.

## Grouping

Group JTBD by actor. Each actor's list should read as a coherent set
of needs. If one actor has 15 JTBD, consider whether some of those
are really a different actor.

## Cross-Check

After writing JTBD, go back to the functional requirements from Phase 2.
Every requirement should map to at least one JTBD. If a requirement
has no JTBD, either the requirement is wrong or you missed an actor.
