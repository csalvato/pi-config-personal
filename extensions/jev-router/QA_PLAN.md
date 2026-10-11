# Jev router QA plan

> **Status:** The deterministic suite and a bounded live campaign ran. See [QA results](QA_RESULTS.md).
> The post-fix full live campaign and real terminal workflow remain pending.

> **Decision:** Follow Jev's top-ranked valid choice. Confidence is diagnostic only.
> Unknown or unresolved choices keep the current model. Pick a new model enters discovery.

## Goal

Verify that the router follows its [documented behavior](README.md), applies the chosen model settings, and keeps user control.
Test the real pi request path as well as the router functions.

Separate two questions:

| Question                                      | How we prove it                                                       |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Does the extension apply its rules correctly? | Fixed responses, real pi integration tests, and exact assertions      |
| Does Jev choose a useful role?                | A labeled set of public tasks, repeated live trials, and error review |

A correct router can receive a poor classification. A good classification can still fail to change the model.
Test both. Do not treat confidence as proof of task quality.

### Evidence already available

| Evidence                                                   | What it proves                                                                                        | What it does not prove                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 71 passing tests                                           | Covered functions, simulated event paths, an isolated real pi agent loop, and the applied-role footer | A real interactive terminal workflow with the user's full extension set |
| `test/session.integration.test.ts`                         | A real `AgentSession` sends the selected model and thinking level to a local provider                 | Provider authentication against an external coding model                |
| Public sample planning request: Planning, confidence 0.93  | Jev can choose Planning with all roles present                                                        | General classification accuracy                                         |
| This QA-plan request: Planning, confidence 0.81; Astra/max | This live session applied the Planning profile                                                        | Different-model routing, discovery, or cancellation correctness         |

## Scope and safety

> **Data warning:** Live tests send text to TypeSafe. Use synthetic tasks and public examples only.
> Keep real code, session transcripts, customer data, and credentials out of fixtures and reports.

- Use a temporary pi agent directory and a temporary working directory.
- Create test role settings instead of editing the user's live config.
- Disable unrelated extensions, skills, context files, and tools in isolated tests.
- Block all network access in offline tests. Use fake credentials there.
- Supply real credentials through the environment for approved live tests only.
- Keep test output local. Record results, not raw user sessions or authorization headers.
- Cap the first live campaign at 200 Jev calls and 12 short coding-model calls.
- Disable tools during live coding-model checks. Model switching must not trigger file or service changes.
- Stop on any private-data leak, unexpected destination, or model outside the allowed set.

Do not change production code while writing this plan. Implement tests and fixes in separate follow-up work.

## Phase 1: Freeze the contract and baseline

1. Record the pi, Node, and Jev versions.
2. Record a hash of the extension source and test config.
3. Run the current checks.
4. Link each README claim to a case in the matrix below.
5. Record any mismatch as a defect or an explicit documentation decision.

```sh
cd ~/.pi/agent/prototypes/jev-router
npm run check
```

Use top-ranked selection without a confidence cutoff. Ignore legacy `confidence` settings.
Keep the Jev version pinned to `jev-1.13.0`.

### Contract questions to settle before sign-off

These are test targets, not confirmed defects.

| Question                                                       | Proposed contract                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| What does an 8,000-character limit count?                      | Document the unit. Test ASCII and Unicode at the boundary.                                                          |
| Can cancelling a save dialog still apply a model?              | Cancelling model selection keeps current. Declining role saving can still apply the chosen model once.              |
| Does turning routing off revoke data-sharing consent?          | Off stops routing for the session. Persistent consent remains until `typeSafeConsent` is set to `false`.              |
| How does Ask mode differ from the discovery pool?              | Jev's suggestion uses the pool. A manual choice may use any available, eligible model within the session scope.     |
| What happens if another extension changes the model?           | Pause routing rather than fight that extension. Report this as an external change, not necessarily a manual choice. |
| What if the model changes but thinking or config saving fails? | Report the actual state. Never say “kept current” after a successful model change.                                  |
| What does `/router explain` mean after reload?                 | No in-memory last decision. Existing decision entries remain in the local session.                                  |

## Phase 2: Expand deterministic coverage

Use fixed Jev answers. Assert inputs, outputs, model settings, call counts, and config changes.
The expected result must come from this contract, not from the implementation under test.

**Priority:** P0 blocks automatic use. P1 blocks completion of the QA campaign.

### Modes, roles, and lifecycle

| ID  | Priority | Case                                                              | Required result                                                                                                                                       |
| --- | -------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | P0       | Fresh startup; persistent consent false or true; missing key; decline | False asks for consent; decline sends no request. True skips the prompt. Missing credentials stop routing. The task still runs with its current model. |
| M02 | P0       | Shadow and `/router test`                                         | Classification only. No model, thinking, tool, permission, or role-file change.                                                                       |
| M03 | P0       | Auto chooses each configured role                                 | Apply that role's model and effective thinking before the first provider request.                                                                     |
| M04 | P0       | Assigned role fails scope, availability, or context checks        | Still offer the role to Jev. Keep current after selection and report the blocking reason.                                                             |
| M05 | P0       | Planning and Review use the current model near its context limit  | Both choices remain present. Apply max thinking without a model switch.                                                                               |
| M06 | P0       | Keep current; winning role at 0, 0.52, 0.65, and 1 confidence     | Keep leaves model and thinking unchanged. Any valid top-ranked role can act, even at zero confidence.                                                 |
| M07 | P0       | User changes model or thinking                                    | Pause routing. Re-enabling resumes it. Router-owned changes do not pause it.                                                                          |
| M08 | P0       | Reload, new session, resume, fork, clone, and tree navigation     | Interactive sessions restore auto routing and honor persistent consent. Headless modes and tree navigation stay off. Old results cannot mutate the new session. |
| M09 | P0       | Multiple tool turns, retry, and compaction                        | No extra classification within the same accepted user request.                                                                                        |
| M10 | P0       | Queued steering, queued follow-up, and extension-generated input  | Keep the active model. No stale prior input is classified.                                                                                            |
| M11 | P1       | Raw input passes through skill expansion or another input handler | Capture the intended input once. Never send expanded private context by mistake.                                                                      |
| M12 | P1       | TUI, RPC, print, and JSON modes                                   | Follow supported-mode rules. No hangs, UI prompts in headless modes, or protocol output corruption.                                                   |
| M13 | P1       | Applied-role footer                                               | Show the applied role beside the model. Keep the label for Keep current or failed choices. Clear it on manual changes, off, shadow, or session reset. |

### Model checks and adaptation

| ID  | Priority | Case                                                                       | Required result                                                                                                                              |
| --- | -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | P0       | Missing documentation role; Ask mode                                       | Suggest an allowed model. Accept, choose another, or cancel. Save only with consent and a successful selection.                              |
| A02 | P0       | Missing starter role; automatic discovery                                  | Resolve the top model and a recognized starter role before saving. Later requests can use the saved role.                                    |
| A03 | P0       | Novel task outside starter roles                                           | Auto makes a one-off choice. Ask can save a user-named role and user-written criteria.                                                       |
| A04 | P0       | Empty pool; unavailable models; unknown choices; Keep current in discovery | No invented model, invalid switch, or accidental learned role.                                                                               |
| A05 | P0       | Authentication fails after a recommendation                                | Keep the current model. Do not save a learned role. Continue the original user task.                                                         |
| A06 | P0       | Smaller context window; images in current or retained context              | Block an incompatible different-model switch. Keep same-model thinking changes available.                                                    |
| A07 | P0       | First request, measured usage, and post-compaction unknown usage           | Count system and tool overhead once. Apply the stated conservative fallback for unknown usage.                                               |
| A08 | P1       | Shared models; explicit or omitted thinking levels                         | Apply explicit levels after pi's clamping. Omitted levels preserve current thinking for the same model and use pi's settings after a switch. |
| A09 | P1       | Assign, clear, delete, or edit roles and pool entries                      | Persist the exact edit. Role assignment adds its model to the pool. Clearing a role does not silently remove pool entries.                   |
| A10 | P1       | Shadow discovers a role                                                    | Show the recommendation without opening a model picker or saving a role.                                                                     |

### Failures, cancellation, and storage

| ID  | Priority | Case                                                                          | Required result                                                                                |
| --- | -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| F01 | P0       | 401, 403, 422, 429, 529; DNS/TLS failure; timeout                             | Keep current. No retry storm or response-body leak. Original task continues once.              |
| F02 | P0       | Slow headers, stalled body, invalid JSON, oversized body                      | Enforce the deadline and 128,000-byte response limit. No late switch.                          |
| F03 | P0       | Unknown choice; missing probabilities; non-finite values; inconsistent winner | Reject the response. Test the documented numeric tolerances at their boundaries.               |
| F04 | P0       | Off or shutdown during either Jev call                                        | Abort pending work. No late model change or role save.                                         |
| F05 | P0       | Manual model or thinking change while auth or a picker waits                  | The user's newer choice wins. Old routing work cannot overwrite it.                            |
| F06 | P0       | Model selection succeeds, then thinking or role saving fails                  | Log the partial outcome truthfully. Preserve unrelated config changes.                         |
| F07 | P1       | Two sessions edit the same role file                                          | Detect conflicts. No partial file, lost update, or leaked temporary file.                      |
| F08 | P1       | Malformed config, read-only directory, full disk, stale lock                  | Keep valid data intact. Show a useful error and a safe recovery path.                          |
| F09 | P1       | Boundaries: roles, pool size, criteria length, Unicode, empty input           | Validate input without crashes or silent truncation. Cancelled edits preserve the prior value. |

Add these cases to `test/core.test.ts` and `test/extension.test.ts` where possible.
Create a failing regression test before each implementation fix.

## Phase 3: Prove real pi integration

This is the highest-value new test layer.
The current extension tests call event handlers against a fake pi object. Keep them, but do not use them as the final integration proof.

### Test setup

Use the installed pi SDK with a real `AgentSession` and test UI bindings.
Register the router with its injected fetch function, key getter, and temporary config path.
Register synthetic model providers that capture requests and return fixed responses.

Use three models with different context sizes, image support, and thinking capabilities.
Do not call external model APIs in this phase.

```text
Test user input
      |
      v
Real pi input and before_agent_start events
      |
      v
Router + fixed Jev response
      |
      v
Real pi model and thinking state
      |
      v
Captured provider request
```

For every case, compare four observations:

1. Choices actually sent to Jev.
2. Router's reported decision.
3. Pi's effective model and thinking state.
4. Model ID and reasoning settings used by the next provider request.

A status notification or a model's claim about its own identity is not enough.

### Required scenarios

- Same-model change: Astra-style current model, medium to max thinking.
- Different-model change: fast, implementation, and planning profiles in sequence.
- Unsupported thinking level: verify the effective level after pi clamps it.
- Existing conversation: switch providers with prior text, tool calls, tool results, and images.
- Tool loop: the selected model stays active throughout the request.
- Follow-up input: prove there is no stale prompt or extra router call.
- Automatic retry and compaction: retain the promised routing behavior.
- Auth failure: keep the old model and run the task once.
- External model change during routing: respect the later user choice.
- Reload or session replacement during pending work: reject stale results.
- Another input-transforming extension: test both extension load orders with synthetic private-context markers.

Proposed new file: `test/session.integration.test.ts`.
A small test-only provider helper can live under `test/helpers/`.

## Phase 4: Verify privacy and audit accuracy

Put distinct fake markers in these locations:

- Raw current input.
- Prior user and assistant messages.
- System prompt and expanded skill content.
- Tool schema and tool result.
- Image content.
- Fake API key and fake upstream error body.

Capture the router request in memory. Only the raw current input marker may enter its `state`.
Also allow the documented role criteria, model metadata, and image-presence boolean.
The fake key belongs only in the request's authorization header, not logs or saved config.

Assert these boundaries:

| Surface                  | Required result                                               |
| ------------------------ | ------------------------------------------------------------- |
| TypeSafe destination     | Fixed HTTPS origin; redirects rejected                        |
| Router config            | Role settings only; owner-only file permissions               |
| Router decision entries  | No captured request text, key, image content, or error body   |
| Coding-model context     | Router decision entries stay out of the message context       |
| `/router explain`        | Choice, confidence, blocking reason, and actual outcome agree |
| Failed or blocked switch | Distinguish the proposed model from the applied model         |
| Provider usage           | Keep Jev usage separate from coding-model usage               |

Pi normally saves user messages in its own session. The privacy claim concerns the router's added records and outbound TypeSafe request.
Do not mistake normal local session storage for a router leak.

## Phase 5: Test classification quality with live Jev

Create a fixed set of 60 synthetic tasks before looking at Jev's answers.
Label the expected role or acceptable role set in advance.

| Group                    |  Tasks | Example                                                                     |
| ------------------------ | -----: | --------------------------------------------------------------------------- |
| Fast                     |      6 | Apply an explicit one-word replacement to supplied text                     |
| Coding implementation    |      6 | Implement a calculator function and its tests                               |
| Review                   |      6 | Review a supplied public diff for bugs; make no edits                       |
| Planning                 |      6 | Plan a database refactor; do not implement it                               |
| Question answering       |      6 | Explain how a public API works                                              |
| Documentation            |      6 | Write a README for a public calculator                                      |
| Keep current             |      6 | Short continuation with unclear standalone intent                           |
| Missing role             |      6 | Omit Documentation, then request a README                                   |
| Ambiguous or adversarial |     12 | Mixed tasks, misleading role names, or instructions to ignore routing rules |
| **Total**                | **60** |                                                                             |

Run the first-choice question three times per task: 180 calls.
Reserve up to 20 calls for live discovery and terminal checks combined. Enforce the 200-call campaign limit.
Use offline tests for the full discovery state machine.
For the missing-role group, the expected first choice is Pick a new model. Test its later behavior separately.

Include paraphrases and negative instructions. In particular, distinguish these outputs:

- “Plan the implementation” from “implement the plan.”
- “Review this plan” from “write a plan.”
- “Explain this function” from “change this function.”
- “Write documentation” from “plan documentation work.”

### Measures

Report results by role, not only as one overall rate:

- Expected-role selections out of total clear-task trials.
- Correct recommendations out of all recommendations, regardless of reported confidence.
- Unknown or unresolved target count.
- New-role choices when an existing role fits.
- Choices that disagree across the three repeated trials.
- Request failures, input tokens, and routing latency.

Low confidence does not change the expected action. Unknown or unresolved choices keep the current model.
This first-choice benchmark measures recommendations, not applied model changes.
Repeated answers measure stability, not independent proof of correctness.

> **Proposed QA targets:** On the 48 clear tasks, at least 90% of trials select the expected choice.
> At least 95% of recommendations for a configured role must match the prewritten label.
> Review every wrong choice before enabling auto mode broadly. These targets guide review; they do not add runtime confidence cutoffs.

These are prototype targets, not current measured results.
Ambiguous tasks use their prewritten acceptable sets and report separately.
Keep a held-out set if criteria need tuning. Do not relabel failures to improve the score.

## Phase 6: Exercise the real terminal workflow

Use an isolated interactive pi process, then a short check with the user's normal extension set.
Save and restore only the settings changed for this test. Do not reset unrelated work.

1. Open `/router` and visit each menu.
2. Assign models to all initial roles without an API key.
3. Filter model names by provider and model name.
4. Add a custom role and edit its criteria.
5. Test arrows, Enter, Escape, Ctrl+C, terminal resize, and long lists.
6. Check both light and dark themes at narrow and normal terminal widths.
7. Enable shadow mode and reject the first consent prompt.
8. Accept consent, then run a test prompt.
9. Verify shadow mode keeps both model and thinking unchanged.
10. Enable auto mode and send a planning request.
11. Check the role beside the model in the footer.
    - Match it against the applied role, effective thinking, and next provider request.
    - Test same-model role changes, Keep current, failed choices, and custom roles.
    - Check both themes and narrow terminal widths.
12. Test both Ask and automatic discovery in the isolated config.
13. Pin a model manually and confirm routing pauses.
14. Run `/router off` during a delayed routing request.
15. Reload and confirm interactive auto routing resumes. Check both persistent-consent settings.
16. Remove the extension from the isolated settings and confirm pi starts cleanly.

Use at most 12 short live coding-model requests within the remaining Jev call budget.
They need only return a fixed acknowledgement. Use fixed Jev responses for terminal checks that need controlled delays.
The goal is to verify transport and settings, not to run real engineering work.

## Phase 7: Timing, reliability, and sign-off

Measure one-call routing and two-call discovery separately.
Separate Jev network time from time spent waiting for a user dialog.

| Check                 | Proposed gate                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Offline suite         | All tests pass without network access                                                           |
| P0 contract cases     | All pass; no unexplained skips                                                                  |
| Model application     | Every accepted decision matches the next provider request                                       |
| Safety                | Zero unintended model switches, role saves, or private-data leaks                               |
| Deadlines             | Each stalled Jev request ends within its configured deadline plus 500 ms in the controlled test |
| Live one-call latency | Report median and p95; target p95 below 1 second, excluding user wait time                      |
| Classification        | Meet Phase 5 targets or stay in shadow mode                                                     |
| Documentation         | Every claim has evidence, a stated limit, or an open defect                                     |

The one-second live target is a goal, not a vendor guarantee.
Keep routing fail-safe if the network cannot meet it.
Test delayed provider authentication separately; a Jev timeout does not bound model-switch authentication.

### Results artifact

Create `QA_RESULTS.md` after execution. Include:

- Source hash, config hash, and dependency versions.
- Case ID, expected result, observed result, and pass/fail status.
- Intended role, Jev choice, confidence, proposed model, actual model, and effective thinking.
- Router request count, provider request count, timing, and config-write count.
- Aggregate live results by role.
- Open defects, reproduction steps, and the decision to use off, shadow, or auto mode.

Use synthetic evidence only. Do not attach raw personal sessions.

## Execution checklist

- [x] Freeze the contract questions and record the baseline.
- [x] Add focused deterministic cases, including confidence-free routing and missing-profile discovery.
- [x] Add real pi agent-loop integration tests with a local provider.
- [x] Verify the main outbound boundary and audit accuracy in isolated tests.
- [x] Label the 60-task public live set before running it.
- [x] Run the 180-call baseline campaign and an 18-call targeted rerun.
- [ ] Complete the terminal workflow checks.
- [x] Fix the missing-profile discovery defect with regression tests and a focused live rerun.
- [x] Write `QA_RESULTS.md` and review the affected README claims.
- [ ] Run a new full campaign and decide whether automatic routing is ready for broader use.

## Glossary

- **QA:** Quality assurance. Tests and review that compare behavior with a stated contract.
- **Contract:** The behavior the extension promises to the user.
- **Role:** A task label with criteria, a model, and an optional thinking level.
- **Discovery:** Choosing a model when no configured role fits.
- **Fixture:** A fixed test input with an expected result.
- **Integration test:** A test that runs the router through pi's real event and request path.
- **P0:** A defect that blocks automatic use.
- **P1:** A defect that blocks completion of this QA campaign.
- **p95:** The latency at or below which 95% of measured requests finish.
- **Held-out set:** Tasks kept separate from the examples used to tune criteria.
