# SCQA Overview Example

SCQA stands for Situation, Complication, Question, Answer. It frames the
problem so a reader understands WHY the system exists before learning WHAT
it does.

Good SCQA is implicit. You don't label the sections "Situation" and
"Complication." The structure is there, but the reader experiences it as
a natural narrative.

## Example: Collections System

> Lending products move through a lifecycle: origination, servicing,
> repayment, and, when terms are breached, collections. Today, each
> lending product manages its own collections logic. Flex loans have
> one system. Credit card accounts have another. When a new product
> launches, the team builds collections from scratch.
>
> This means every new product launch carries weeks of collections
> engineering. Existing flows can't be reused. Compliance rules get
> reimplemented (and sometimes missed). There's no way to compare
> strategy performance across products or run experiments.
>
> This document defines a shared collections system that any lending
> product can use. It provides configurable workflows, a standard API
> for enrollment, and built-in support for A/B testing collection
> strategies. The goal: launch collections for a new product in days,
> not months.

**What makes this work:**
- Situation (first paragraph): states the landscape without drama
- Complication (second paragraph): names the pain. Concrete. Specific.
- Question is implied: "How do we fix this?"
- Answer (third paragraph): states the solution and the measurable goal

**What to avoid:**
- Don't label the sections. Let the structure do the work.
- Don't use superlatives. "Revolutionary" and "game-changing" mean nothing.
- Don't explain the entire system in the overview. That's what the rest of the doc is for.
- The Answer will be a rough placeholder until the design is done. Rewrite it in Phase 9.
