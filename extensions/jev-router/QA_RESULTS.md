# Jev router QA results

> **Status:** Partial pass. The deterministic suite and the bounded live campaign found and fixed one discovery defect.
> Do not use this document as approval for broad automatic routing. The post-fix 60-task campaign and terminal workflow remain incomplete.

## Test environment

| Item                              | Value                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Date                              | 2026-09-24                                                         |
| Node                              | v25.9.0                                                            |
| pi                                | 0.85.1                                                             |
| Jev                               | jev-1.13.0                                                         |
| Extension source hash             | `e5094747ee9696851f1a57d465ac101e10357ed69f28d91bf448807de3fea0ea` |
| Active router config hash         | `e0e8ed836cc2d8937453927037fc938d6d6a5bd20b8e1069ff10655b300ba578` |
| Synthetic tasks stored in results | No                                                                 |

The source hash covers the routing, footer, test, and live-QA files listed by the QA run.
The config hash identifies the configuration without recording its contents.

## Offline checks

`npm run check` passed.

| Check                             | Result | Evidence                                                 |
| --------------------------------- | ------ | -------------------------------------------------------- |
| TypeScript                        | Pass   | `tsc --noEmit`                                           |
| Automated tests                   | Pass   | 71 passed, 0 failed                                      |
| External coding-model calls       | None   | Agent-loop tests use a loopback OpenAI-compatible server |
| TypeSafe calls in `npm run check` | None   | Tests inject Jev responses                               |

### Real pi agent-loop coverage

The integration tests use a real `AgentSession`, a temporary router config, and a local provider.
They confirm these facts at the provider boundary:

| Case                            | Result                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Coding route                    | Provider received `implementation` with `reasoning_effort: high`                    |
| Planning route on current model | Provider received `planner` with `reasoning_effort: max`                            |
| Manual model change             | Routing paused until `/router auto` ran again                                       |
| Discovery                       | Provider received the selected model and saved a recognized role after selection    |
| Router request boundary         | Router excluded prior turns, system text, model output, and router decision entries |

The suite also covers role visibility, context and image checks, cancellation, malformed results, config conflicts, footer behavior, and model-thinking changes.

## Persistent-consent update (2026-10-10)

TypeScript checking passed after the persistent TypeSafe consent change.
The targeted core, extension, Pi loader, and real-session integration suite passed 67 tests.
The tests cover legacy config migration and consent reuse across session starts. They make no live TypeSafe calls.

## Live Jev campaign

The campaign used public synthetic tasks only.
It sent no coding-model requests.
The runner writes fixture IDs, choices, confidence, and latency. It does not write task text.

### Baseline

The baseline ran 60 fixtures three times: 180 Jev calls. [Machine-readable baseline data](qa/live-results.json) contains fixture IDs only.

| Metric              |           Result |
| ------------------- | ---------------: |
| Clear-task accuracy | 126 / 144, 87.5% |
| Jev request errors  |                0 |
| Median latency      |           162 ms |
| p95 latency         |           226 ms |
| Clear-task target   |              90% |
| Result              |             Fail |

The seven configured-profile groups passed all 126 trials:

| Group              | Correct |
| ------------------ | ------: |
| Fast               | 18 / 18 |
| Coding             | 18 / 18 |
| Review             | 18 / 18 |
| Planning           | 18 / 18 |
| Question answering | 18 / 18 |
| Documentation      | 18 / 18 |
| Keep current       | 18 / 18 |

All 18 missing-documentation trials failed. Jev selected Fast, Planning, or Keep current rather than Pick a new model.

### Defect and fix

The first routing question did not tell Jev which reusable profiles lacked an assigned model.
Jev had no evidence that Documentation was an available discovery category.

The router now adds missing starter and unassigned custom profiles to the **Pick a new model** criterion.
It tells Jev to choose discovery when a missing profile fits better than any configured profile.

A focused rerun used 18 additional calls, keeping the total at 198 calls within the 200-call budget. [Machine-readable follow-up data](qa/missing-documentation-followup.json) contains fixture IDs only.

| Follow-up check                                         |  Result |
| ------------------------------------------------------- | ------: |
| Missing-documentation trials selecting Pick a new model | 18 / 18 |
| Jev request errors                                      |       0 |
| Median latency                                          |  214 ms |
| p95 latency                                             |  721 ms |

The targeted defect is fixed.
A new full 60-fixture campaign is still needed because the first-choice question changed.

## Privacy and data boundary

| Check                                                                   | Result                           |
| ----------------------------------------------------------------------- | -------------------------------- |
| Router request excludes history, system prompt, tool output, and images | Pass in isolated agent-loop test |
| Persistent consent skips the prompt across session starts                 | Pass in isolated extension test |
| Live result files exclude task text                                     | Pass                             |
| Decision entries exclude task text and keys                             | Pass in automated tests          |
| Earlier input transformer can change router input                       | Open limitation                  |

> **Warning:** pi runs input handlers in extension load order. If an earlier extension adds private text to input, the router receives that changed text.
> The router now appears first in the explicit `extensions` list in `~/.pi/agent/settings.json` to reduce this risk. The pi extension API cannot recover original text after an earlier transform.

## Open work

| Priority | Item                                                              | Status                                                                                            |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| P0       | Full live rerun after the missing-profile fix                     | Not run. The 200-call campaign budget is exhausted.                                               |
| P1       | Terminal workflow in a real interactive pi TUI                    | Not run.                                                                                          |
| P1       | Test input-transform order with the user's complete extension set | Not run. The isolated test shows the order limitation.                                            |
| P1       | Add remaining failure cases from the QA matrix                    | Partial. The existing suite covers the main failures, but not every listed disk and lock failure. |
| P1       | Review the 12 ambiguous fixtures                                  | Not done. They are reported separately and do not affect the clear-task rate.                     |

## Decision

Keep automatic routing limited to public or approved tasks.
The corrected configured profiles and focused discovery test passed.
Run a fresh full campaign, then complete the terminal workflow before approving broader use.
