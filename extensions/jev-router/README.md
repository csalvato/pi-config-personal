# Jev model router for pi

This local prototype lets Jev choose a model profile for each new user request.
You assign the models and write the selection criteria. Jev chooses directly among those profiles.

> **Data warning:** Both shadow mode and automatic routing send your request to TypeSafe.
> Use public or approved data only. Keep API keys out of chat and config files.

## Start

Interactive sessions start in automatic routing mode. Before the first routed request, the extension asks for TypeSafe data-sharing consent.
Startup does not make a TypeSafe request. Missing credentials or declined consent turn routing off for the session.
Headless and RPC sessions start with routing off. Configure roles without a TypeSafe key.

1. Load the extension with `pi -e ~/.pi/agent/prototypes/jev-router/index.ts`.
2. Run `/router roles`.
3. Select a role, then select **Assign model and thinking**.
4. Type part of a model name to filter the model picker.
5. Select the model and thinking level.

Set `TYPESAFE_API_KEY` through your shell or secret manager before starting pi.
A running pi process does not inherit later shell changes. Restart pi after setting the key.

1. Run `/router test Write a README for a public calculator project`.
2. Read and accept the data-sharing prompt.
3. Run `/router shadow` to inspect recommendations on your next requests.
4. Run `/router auto` when you want pi to apply the choices.
5. Run `/router off` to stop routing.

The test command classifies the supplied text. It does not run the task.
If this path is registered in pi settings, `/reload` loads the extension without `-e`.

## Commands

| Command               | Action                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `/router`             | Open the searchable menu                                           |
| `/router roles`       | Assign models, edit criteria, add roles, or remove roles           |
| `/router pool`        | Choose the models Jev may select during discovery                  |
| `/router new`         | Choose **Ask me** or **Choose automatically** for new tasks        |
| `/router shadow`      | Record recommendations without switching or saving new roles       |
| `/router auto`        | Switch models before new user requests                             |
| `/router off`         | Stop routing and cancel pending Jev requests                       |
| `/router test <task>` | Classify a task without running it or changing the model           |
| `/router explain`     | Show the last choices, probabilities, confidence, and routing time |

Modes apply to the current session only. Interactive startup, reload, and session replacement restore automatic routing and require fresh consent.
Tree navigation turns routing off. `/router off` disables routing until you re-enable it or start or reload a session.
A manual model or thinking-level change pauses routing. Run `/router auto` or `/router shadow` to resume.

## Current role display

After automatic routing applies a role, the bottom-right model display includes its label:

```text
gpt-6-astra • max • Jev: Planning
```

The label describes the last role the router applied, not a pending recommendation.
It uses your role label, including custom roles. One-off discovery shows the recognized role or **New task**.

- Same-model role changes update the label, even when the model and thinking level stay the same.
- **Keep current** and failed choices preserve the last applied label.
- `/router test` leaves the label unchanged. Shadow recommendations never add a label.
- Manual model or thinking changes, off mode, shadow mode, reload, and session changes clear the label.

The footer keeps the directory, git branch, session name, usage totals, context usage, and other extension statuses.
It uses the active theme and keeps the role visible when terminal space is limited.

> **Footer compatibility:** Pi supports one custom footer at a time. The router installs its footer only after it applies a role.
> Another footer extension can replace it. Clearing the role restores the built-in footer only if the router still owns it.

## Roles

The initial roles are unassigned:

- Fast
- Coding implementation
- Review
- Planning
- Question answering

Add starter roles for documentation, deep debugging, research, frontend, or data analysis.
Use **Add a custom role** for any other task. Edit each role's criteria to describe your preferences.
Several roles can share a model but use different thinking levels.

Two choices always exist:

| Choice           | Behavior                                                       |
| ---------------- | -------------------------------------------------------------- |
| Keep current     | Keep both the current model and thinking level                 |
| Pick a new model | Look for a suitable model outside the configured task profiles |

The router follows Jev's top-ranked choice without a minimum confidence cutoff.
Confidence is diagnostic only. An unknown choice or an unresolved model keeps the current model.
If Jev chooses **Pick a new model**, discovery selects from the allowed models.

Every role with an assigned model appears in the first Jev question. The **Pick a new model** choice also lists reusable profiles without a model, including starter profiles you have not added yet. This lets Jev choose discovery instead of stretching a task into an unrelated configured role. Context limits never hide these choices.
After Jev chooses a role, the extension checks whether it can switch to that model.
If a check blocks the switch, `/router explain` shows the reason. Shadow mode reports the same checks.
An unassigned role can still appear as a discovery suggestion.

## New tasks and adaptation

```text
Raw user request
       |
       v
Jev Choice: configured roles / keep current / pick new model
       |
       +-- configured role --> apply its model and thinking
       |
       +-- keep current ----> change nothing
       |
       +-- pick new model --> Jev Choice: allowed models + missing starter roles
                                  |
                                  +-- Ask --> user picks and can save a role
                                  |
                                  +-- Auto -> apply model; save a recognized role
```

**Ask me** is the default discovery behavior. You can accept Jev's suggestion, choose another eligible model, or keep the current model.
The extension offers to save a recognized starter role. For another task type, you can name a custom role and write its criteria.

**Choose automatically** restricts Jev to your discovery pool. Assigning a role adds its model to that pool.
Use `/router pool` to add or remove models. Clearing a role does not remove its model from the pool.

The extension saves a new starter role only after a successful model selection.
The top model choice must resolve to an allowed model, and the top starter-role choice must match a known role.
Confidence does not block selection or saving.
If Jev selects an unknown task type, the model choice applies once. Add a custom role yourself to reuse it.

Jev returns fixed choices, not new prose. The prototype does not invent arbitrary category names or rules.
It learns mappings from starter roles to models. It does not train Jev or learn from task outcomes.

Shadow mode can suggest a new role, but it never saves one or opens a model dialog.

## Guardrails and limits

- Switching to a different model requires availability and membership in pi's session model scope.
- Keeping the current model can still change its thinking level. Pi handles compaction for that model.
- Automatic discovery also requires membership in your explicit discovery pool.
- Context-capacity checks reserve space for output and use conservative estimates.
- Measured provider usage already includes system prompts and tool schemas. The router does not count them twice.
- Switching models with images in the request or retained history requires an image-capable target.
- Unknown or unresolved choices, timeouts, malformed answers, and failed authentication keep the current model.
- Each Jev call has a deadline. Discovery can make two calls per request.
- Routing happens once before the agent starts, not between tool calls.
- Queued steering, queued follow-ups, and extension-generated messages keep the current model.
- A profile selects a model and thinking level only. It does not change tools or permissions.

The prototype sends only the current input it receives, not an expanded skill or prompt template.
It does not send prior messages, files, tool output, system prompts, or images to Jev.
Text you paste into the request still goes to TypeSafe. There is no automatic secret redaction.

> **Input-transform warning:** pi runs input handlers in extension load order. Put the router before any extension that adds private text to user input.
> A transformer that runs first can change the text that the router receives. The router cannot recover the original text from pi's extension API.

Short follow-ups lack conversation context, so **Keep current** is usually the right choice.
Requests longer than 8,000 characters keep the current model without calling Jev.

> **Measurement limit:** Jev's confidence does not measure downstream model quality.
> Check task results before using routing for important work. Listed model prices may differ from your subscription costs.

## Config and local records

Role edits persist in `~/.pi/agent/jev-router.json`, or the equivalent path under a custom pi agent directory.
The extension writes this file with owner-only permissions. It detects concurrent edits rather than overwriting them.
The file contains model choices and criteria, not API keys or captured task text.

| Field        | Default               | Meaning                                                |
| ------------ | --------------------- | ------------------------------------------------------ |
| `version`    | `1`                   | Config format                                          |
| `jevModel`   | `jev-1.13.0`          | Pinned TypeSafe model version                          |
| `timeoutMs`  | `3000`                | Deadline per Jev call                                  |
| `newRole`    | `ask`                 | New-task behavior: `ask` or `auto`                     |
| `autoModels` | `[]`                  | Allowed models for discovery                           |
| `roles`      | Five unassigned roles | Labels, criteria, models, and optional thinking levels |

Each model reference has a `provider` and `id`. Each role has an `id`, `label`, and `criteria`.
Role `model` and `thinking` fields are optional. Omit `thinking` to leave pi's effective level unchanged when reusing the same model.
When switching models, pi applies its normal model-specific thinking settings.

The extension reloads config before commands and routing decisions.
Legacy `confidence` cutoffs are ignored and removed on the next config save.
Invalid config leaves routing unable to act. Fix the file before continuing.

Decisions are stored as local `jev-router-decision` session entries.
They include choices, probabilities, confidence, timing, Jev version, and usage, but not task text or keys.
These entries do not enter the coding model's context. Jev usage is separate from pi's normal model-cost totals.

## Tests

See the [QA plan](QA_PLAN.md) for claim coverage and the bounded live test campaign. See [QA results](QA_RESULTS.md) for completed checks and open work.

`npm run check` uses fake Jev responses and a local coding-model server. It does not call TypeSafe or an external coding model.
It covers routing rules, config writes, cancellation, privacy boundaries, the actual picker, pi's extension loader, and real pi agent-loop routing.
Footer tests cover applied-role state, light and dark themes, terminal widths, custom labels, and cleanup.

Run the bounded public live campaign with `npm run qa:live -- --confirm-live`. It sends 60 synthetic tasks three times, writes a local result file, and never stores task text in that file.

```sh
cd ~/.pi/agent/prototypes/jev-router
npm run check
```

The local development setup uses symlinks to the installed pi packages for type checking and loader tests.
Runtime loading through pi supplies those packages. The extension has no added runtime dependencies.

## Remove

Remove `~/.pi/agent/prototypes/jev-router/index.ts` from the `extensions` list in pi's settings, then run `/reload`.
For a session started with `-e`, restart pi without that flag.
Keep `jev-router.json` if you want to preserve your role choices.

## Glossary

- **Role / profile:** A task label, selection criteria, model, and optional thinking level.
- **Applied role:** The last role the router successfully selected for the current model and thinking level.
- **Discovery:** Selecting a model when no configured role fits.
- **Pool:** Models you allow Jev to select during discovery.
- **Shadow mode:** Ask Jev and record its choices without applying them.
- **Confidence:** A diagnostic measure of how concentrated Jev's probability distribution is. It does not control routing.
- **Top-ranked choice:** The choice Jev returns with the highest probability. For a tie, the router accepts either tied choice.

## Sources

- [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice)
- [TypeSafe API](https://docs.typesafe.ai/api)
- [TypeSafe model limits](https://docs.typesafe.ai/models)
- [TypeSafe known failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
