import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "./config.ts";
import { createRoleDisplay } from "./footer.ts";
import {
  askJev,
  defaults,
  discoveryQuestions,
  eligibilityIssue,
  KEEP,
  NEW,
  modelKey,
  missingProfiles,
  routeQuestion,
  sameModel,
  STARTERS,
  type Candidate,
  type Config,
  type JevResult,
  type Mode,
  type ModelRef,
  type Role,
  type Requirements,
  type Thinking,
} from "./core.ts";

export interface PickItem {
  value: string;
  label: string;
  description?: string;
}
export type Picker = (
  ctx: ExtensionContext,
  title: string,
  items: PickItem[],
) => Promise<string | undefined>;
interface Options {
  configPath: string;
  pick: Picker;
  fetcher?: typeof fetch;
  apiKey?: () => string | undefined;
}
interface Decision {
  mode: Mode | "test";
  outcome: string;
  from?: string;
  to?: string;
  role?: string;
  confidence?: number;
  latencyMs: number;
  evaluations: JevResult[];
}
const LEVELS: Thinking[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function registerRouter(pi: ExtensionAPI, options: Options): void {
  const store = new ConfigStore(options.configPath);
  const roleDisplay = createRoleDisplay();
  let config = defaults();
  let mode: Mode = "off";
  let consent = false;
  let pinned = false;
  let applying = false;
  let pendingInput: string | undefined;
  let active: AbortController | undefined;
  let last: Decision | undefined;
  const key = options.apiKey ?? (() => process.env.TYPESAFE_API_KEY);
  const pick = options.pick;

  function notify(
    ctx: ExtensionContext,
    message: string,
    severity: "info" | "warning" | "error" = "info",
  ) {
    if (ctx.hasUI) ctx.ui.notify(message, severity);
  }
  function status(ctx: ExtensionContext) {
    if (ctx.hasUI)
      ctx.ui.setStatus(
        "jev-router",
        mode === "off"
          ? undefined
          : `Jev: ${mode}${pinned ? " (manual pin)" : ""}`,
      );
  }
  function load() {
    config = store.load();
  }
  function save(next: Config) {
    store.save(next);
    config = next;
  }
  function stop(ctx: ExtensionContext) {
    mode = "off";
    active?.abort();
    pendingInput = undefined;
    roleDisplay.clear(ctx);
    status(ctx);
  }
  function available(ctx: ExtensionContext) {
    const all = ctx.modelRegistry.getAvailable();
    return ctx.scopedModels.length
      ? all.filter((model) =>
          ctx.scopedModels.some((item) => sameModel(item.model, model)),
        )
      : all;
  }
  function requirements(
    ctx: ExtensionContext,
    prompt: string,
    images: boolean,
  ): Requirements {
    const entries = ctx.sessionManager.buildContextEntries();
    function hasImage(value: unknown): boolean {
      if (!value || typeof value !== "object") return false;
      if (Array.isArray(value)) return value.some(hasImage);
      const item = value as Record<string, unknown>;
      if (item.type === "image") return true;
      // Only inspect active message content, not arbitrary tool details.
      return (
        hasImage(item.content) ||
        hasImage(item.message) ||
        hasImage(item.retainedTail)
      );
    }
    const usage = ctx.getContextUsage();
    const measured =
      usage?.tokens != null &&
      entries.some((entry) => {
        if (entry.type !== "message" || entry.message.role !== "assistant")
          return false;
        const message = entry.message;
        return (
          message.stopReason !== "error" &&
          message.stopReason !== "aborted" &&
          (message.usage.input || 0) +
            (message.usage.cacheRead || 0) +
            (message.usage.cacheWrite || 0) >
            0
        );
      });
    // Provider usage already includes the system prompt and tool schemas.
    const initialOverhead = measured
      ? 0
      : Buffer.byteLength(ctx.getSystemPrompt()) +
        Buffer.byteLength(
          JSON.stringify(
            pi
              .getAllTools()
              .filter((tool) => pi.getActiveTools().includes(tool.name))
              .map((tool) => tool.parameters),
          ),
        );
    return {
      tokens:
        usage?.tokens ??
        (entries.some((entry) =>
          [
            "message",
            "compaction",
            "branch_summary",
            "custom_message",
          ].includes(entry.type),
        )
          ? null
          : 0),
      currentWindow: ctx.model?.contextWindow ?? Number.MAX_SAFE_INTEGER,
      extraTokens: Buffer.byteLength(prompt) + initialOverhead,
      images: images || entries.some(hasImage),
    };
  }
  function candidates(ctx: ExtensionContext, prompt: string, images: boolean) {
    const needs = requirements(ctx, prompt, images);
    return available(ctx).filter(
      (model) => sameModel(model, ctx.model) || !eligibilityIssue(model, needs),
    );
  }
  function selectionIssue(
    ctx: ExtensionContext,
    target: ModelRef,
    prompt: string,
    images: boolean,
  ): string | undefined {
    // Keeping the current model only changes thinking. Pi owns its compaction.
    if (sameModel(target, ctx.model)) return undefined;
    const model = available(ctx).find((item) => sameModel(item, target));
    if (!model) return "model unavailable or outside the session model scope";
    return eligibilityIssue(model, requirements(ctx, prompt, images));
  }
  async function chooseModel(
    ctx: ExtensionContext,
    models: Candidate[],
    title: string,
    suggested?: ModelRef,
  ) {
    const ordered = [...models].sort(
      (a, b) =>
        Number(sameModel(b, suggested)) - Number(sameModel(a, suggested)) ||
        modelKey(a).localeCompare(modelKey(b)),
    );
    const selected = await pick(
      ctx,
      title,
      ordered.map((model) => ({
        value: modelKey(model),
        label: `${sameModel(model, suggested) ? "Suggested: " : ""}${modelKey(model)}`,
        description: `${model.name} | context ${Math.round(model.contextWindow / 1000)}k${model.reasoning ? " | reasoning" : ""}`,
      })),
    );
    return models.find((model) => modelKey(model) === selected);
  }
  async function chooseThinking(
    ctx: ExtensionContext,
    model: Candidate,
  ): Promise<Thinking | "default" | undefined> {
    return (await pick(ctx, "Thinking level (pi clamps unsupported levels)", [
      { value: "default", label: "Model default" },
      ...(model.reasoning ? LEVELS : ["off" as const]).map((level) => ({
        value: level,
        label: level,
      })),
    ])) as Thinking | "default" | undefined;
  }
  function withRole(role: Role): Config {
    const next = structuredClone(config);
    const index = next.roles.findIndex((item) => item.id === role.id);
    if (index >= 0) next.roles[index] = role;
    else next.roles.push(role);
    if (
      role.model &&
      !next.autoModels.some((model) => sameModel(model, role.model))
    )
      next.autoModels.push(role.model);
    return next;
  }
  async function editRole(ctx: ExtensionContext, role: Role) {
    const action = await pick(ctx, role.label, [
      {
        value: "model",
        label: "Assign model and thinking",
        description: role.model ? modelKey(role.model) : "Not assigned",
      },
      {
        value: "criteria",
        label: "Edit selection criteria",
        description: role.criteria,
      },
      { value: "clear", label: "Clear model assignment" },
      { value: "delete", label: "Delete role" },
    ]);
    if (action === "model") {
      const model = await chooseModel(
        ctx,
        available(ctx),
        `Model for ${role.label}`,
        role.model ?? ctx.model,
      );
      if (!model) return;
      const thinking = await chooseThinking(ctx, model);
      if (!thinking) return;
      save(
        withRole({
          ...role,
          model: { provider: model.provider, id: model.id },
          thinking: thinking === "default" ? undefined : thinking,
        }),
      );
    } else if (action === "criteria") {
      const criteria = await ctx.ui.editor(
        `When should Jev pick ${role.label}?`,
        role.criteria,
      );
      if (!criteria?.trim()) return;
      save(withRole({ ...role, criteria: criteria.trim() }));
    } else if (action === "clear") {
      save(withRole({ ...role, model: undefined, thinking: undefined }));
    } else if (
      action === "delete" &&
      (await ctx.ui.confirm("Delete role?", role.label))
    ) {
      save({
        ...config,
        roles: config.roles.filter((item) => item.id !== role.id),
      });
    }
  }
  async function addCustom(
    ctx: ExtensionContext,
    model?: Candidate,
    persist = true,
  ) {
    const label = await ctx.ui.input(
      "New role name",
      "For example: documentation",
    );
    if (!label?.trim()) return;
    const id = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (
      !/^[a-z][a-z0-9_-]{0,63}$/.test(id) ||
      [KEEP, NEW, "other"].includes(id) ||
      config.roles.some((role) => role.id === id)
    ) {
      notify(ctx, "Use a unique role name starting with a letter.", "warning");
      return;
    }
    const criteria = await ctx.ui.editor(
      "When should Jev pick this role? Use general rules, not private task details.",
      "",
    );
    if (!criteria?.trim()) return;
    const selected =
      model ??
      (await chooseModel(
        ctx,
        available(ctx),
        `Model for ${label.trim()}`,
        ctx.model,
      ));
    if (!selected) return;
    const thinking = await chooseThinking(ctx, selected);
    if (!thinking) return;
    const role: Role = {
      id,
      label: label.trim(),
      criteria: criteria.trim(),
      model: { provider: selected.provider, id: selected.id },
      thinking: thinking === "default" ? undefined : thinking,
    };
    if (persist) save(withRole(role));
    return role;
  }
  async function rolesMenu(ctx: ExtensionContext) {
    while (true) {
      const selected = await pick(ctx, "Task roles", [
        ...config.roles.map((role) => ({
          value: role.id,
          label: role.label,
          description: role.model
            ? `${modelKey(role.model)} | thinking: ${role.thinking ?? "default"}`
            : "Not assigned. Jev can discover this role.",
        })),
        {
          value: "@starter",
          label: "Add a starter role",
          description: "Documentation, debugging, research, frontend, data",
        },
        { value: "@custom", label: "Add a custom role" },
        {
          value: "@keep",
          label: "Keep current",
          description:
            "Always available. Leaves the model and thinking unchanged.",
        },
        {
          value: "@new",
          label: "Pick a new model",
          description: `Always available. Discovery mode: ${config.newRole}.`,
        },
      ]);
      if (!selected) return;
      if (selected === "@custom") await addCustom(ctx);
      else if (selected === "@starter") {
        const remaining = STARTERS.filter(
          (role) => !config.roles.some((item) => item.id === role.id),
        );
        const id = await pick(
          ctx,
          "Add starter role",
          remaining.map((role) => ({
            value: role.id,
            label: role.label,
            description: role.criteria,
          })),
        );
        const role = remaining.find((item) => item.id === id);
        if (role) {
          save(withRole(structuredClone(role)));
          await editRole(ctx, role);
        }
      } else if (selected === "@new") await discoveryMenu(ctx);
      else if (selected !== "@keep") {
        const role = config.roles.find((item) => item.id === selected);
        if (role) await editRole(ctx, role);
      }
    }
  }
  async function poolMenu(ctx: ExtensionContext) {
    while (true) {
      const selected = await pick(
        ctx,
        "Models Jev may choose during discovery",
        [
          ...config.autoModels.map((model, i) => ({
            value: String(i),
            label: modelKey(model),
            description: "Select to remove from discovery",
          })),
          { value: "add", label: "Add an allowed model" },
        ],
      );
      if (!selected) return;
      if (selected === "add") {
        const model = await chooseModel(
          ctx,
          available(ctx).filter(
            (item) =>
              !config.autoModels.some((allowed) => sameModel(item, allowed)),
          ),
          "Allow a model for automatic discovery",
        );
        if (model)
          save({
            ...config,
            autoModels: [
              ...config.autoModels,
              { provider: model.provider, id: model.id },
            ],
          });
      } else
        save({
          ...config,
          autoModels: config.autoModels.filter(
            (_model, i) => String(i) !== selected,
          ),
        });
    }
  }
  async function discoveryMenu(ctx: ExtensionContext) {
    const next = await pick(ctx, "When Jev picks a new model", [
      {
        value: "ask",
        label: "Ask me",
        description:
          "Suggest a model, then let me pick and optionally save a role.",
      },
      {
        value: "auto",
        label: "Choose automatically",
        description:
          "Use only allowed models. Save recognized starter roles after a successful switch.",
      },
    ]);
    if (next === "ask" || next === "auto") {
      if (next === "auto" && config.autoModels.length === 0) {
        notify(ctx, "Add an allowed discovery model first.", "warning");
        await poolMenu(ctx);
        if (!config.autoModels.length) return;
      }
      save({ ...config, newRole: next });
    }
  }
  async function allowNetwork(ctx: ExtensionContext) {
    if (!key()) {
      notify(
        ctx,
        "Set TYPESAFE_API_KEY in your shell, then restart pi. Do not paste the key into chat.",
        "warning",
      );
      return false;
    }
    if (consent) return true;
    if (!ctx.hasUI) return false;
    consent = await ctx.ui.confirm(
      "Allow task text to TypeSafe for this session?",
      "Shadow mode also sends data. Jev receives your raw request (up to 8,000 characters), model IDs, role criteria, and model metadata. No prior messages, files, tool output, or system prompt are sent by the router. Pasted secrets or code in your request still leave this machine. Use public or approved data only.",
    );
    return consent;
  }
  function record(ctx: ExtensionContext, decision: Decision) {
    last = decision;
    pi.appendEntry("jev-router-decision", decision);
    const target = decision.to ? ` -> ${decision.to}` : "";
    notify(
      ctx,
      `Jev ${decision.mode}: ${decision.outcome}${target} (${decision.latencyMs} ms)`,
    );
  }
  function explain(ctx: ExtensionContext) {
    const lines = last
      ? [
          `Mode: ${last.mode}. Outcome: ${last.outcome}.`,
          `From: ${last.from ?? "none"}. To: ${last.to ?? "unchanged"}. Role: ${last.role ?? "none"}.`,
          `Confidence: ${last.confidence?.toFixed(3) ?? "none"}. Routing time: ${last.latencyMs} ms.`,
          ...last.evaluations.flatMap((result) => [
            `Jev: ${result.model}. Input tokens: ${result.usage?.input_tokens ?? "unknown"}.`,
            ...Object.entries(result.answers).map(
              ([name, answer]) =>
                `${name}: ${answer.choice} (${answer.confidence.toFixed(3)}). ${Object.entries(
                  answer.probabilities,
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(
                    ([option, probability]) =>
                      `${option}=${probability.toFixed(3)}`,
                  )
                  .join(", ")}`,
            ),
          ]),
        ]
      : [
          "No routing decision yet. Use /router test <public task> or enable shadow mode.",
        ];
    notify(ctx, lines.join("\n"));
  }
  async function switchModel(
    ctx: ExtensionContext,
    model: ModelRef,
    thinking?: Thinking,
  ) {
    const target = sameModel(model, ctx.model)
      ? ctx.model
      : available(ctx).find((item) => sameModel(item, model));
    if (!target) return false;
    applying = true;
    try {
      if (!sameModel(ctx.model, target) && !(await pi.setModel(target)))
        return false;
      if (thinking !== undefined) pi.setThinkingLevel(thinking);
      return true;
    } finally {
      applying = false;
    }
  }
  async function route(
    ctx: ExtensionContext,
    prompt: string,
    images: boolean,
    test = false,
  ) {
    if (active) return;
    const started = Date.now();
    const decision: Decision = {
      mode: test ? "test" : mode,
      outcome: "kept current",
      from: ctx.model && modelKey(ctx.model),
      latencyMs: 0,
      evaluations: [],
    };
    const controller = new AbortController();
    active = controller;
    const originalModel = ctx.model;
    const valid = () =>
      !controller.signal.aborted && sameModel(originalModel, ctx.model);
    const finish = (outcome: string) => {
      decision.outcome = outcome;
      decision.latencyMs = Date.now() - started;
      record(ctx, decision);
    };
    try {
      load();
      if (!consent || !key()) {
        finish("kept current: network opt-in or API key missing");
        return;
      }
      if (!prompt.trim() || prompt.length > 8000) {
        finish(
          "kept current: empty request or request exceeds 8,000 characters",
        );
        return;
      }
      const roles = config.roles.filter((role) => role.model);
      const state = {
        request: prompt,
        current_model: ctx.model ? modelKey(ctx.model) : "none",
        has_images: images,
      };
      const ask = async (questions: Parameters<typeof askJev>[2]) => {
        const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(config.timeoutMs),
          ...(ctx.signal ? [ctx.signal] : []),
        ]);
        const result = await askJev(
          config,
          state,
          questions,
          key()!,
          signal,
          options.fetcher,
        );
        decision.evaluations.push(result);
        return result;
      };
      const first = await ask({
        route: routeQuestion(roles, missingProfiles(config)),
      });
      if (!valid()) return;
      const answer = first.answers.route;
      decision.role = answer.choice;
      decision.confidence = answer.confidence;
      if (answer.choice === KEEP) {
        finish("kept current");
        return;
      }
      let role = roles.find((item) => item.id === answer.choice);
      let target: ModelRef | undefined = role?.model;
      let roleLabel = role?.label;
      let learn: Role | undefined;
      if (answer.choice === NEW) {
        const models = candidates(ctx, prompt, images);
        const pool = models.filter((model) =>
          config.autoModels.some((allowed) => sameModel(model, allowed)),
        );
        const discovery = discoveryQuestions(config, pool);
        const result = Object.keys(discovery.questions).length
          ? await ask(discovery.questions)
          : undefined;
        if (!valid()) return;
        const modelAnswer = result?.answers.model ?? {
          choice: KEEP,
          confidence: 0,
        };
        const profileAnswer = result?.answers.profile ?? {
          choice: "other",
          confidence: 0,
        };
        const suggested = pool.find(
          (_model, index) => `model_${index}` === modelAnswer.choice,
        );
        const template = discovery.templates.find(
          (item) => item.id === profileAnswer.choice,
        );
        decision.confidence = modelAnswer.confidence;
        decision.role = template?.id ?? "new task";
        roleLabel = template?.label;
        if (!test && mode === "auto" && config.newRole === "ask") {
          const selected = await pick(
            ctx,
            `New task${template ? `: ${template.label}` : ""}`,
            [
              ...(suggested
                ? [
                    {
                      value: "suggested",
                      label: `Use Jev's pick: ${modelKey(suggested)}`,
                    },
                  ]
                : []),
              { value: "pick", label: "Pick a model myself" },
              { value: "keep", label: "Keep current" },
            ],
          );
          if (!valid()) return;
          const model =
            selected === "suggested"
              ? suggested
              : selected === "pick"
                ? await chooseModel(
                    ctx,
                    models,
                    "Model for this task",
                    suggested ?? ctx.model,
                  )
                : undefined;
          if (!model || !valid()) {
            finish("kept current: new model selection cancelled");
            return;
          }
          target = model;
          if (template) {
            if (
              await ctx.ui.confirm(
                "Remember this role?",
                `${template.label}: ${template.criteria}\nModel: ${modelKey(model)}`,
              )
            ) {
              learn = {
                ...template,
                model: { provider: model.provider, id: model.id },
              };
            }
          } else if (
            await ctx.ui.confirm(
              "Save a custom role?",
              "Name this task role and write a general selection rule. Cancel to use the model only for this request.",
            )
          ) {
            learn = await addCustom(ctx, model, false);
          }
        } else {
          target = suggested;
          if (suggested && template)
            learn = {
              ...template,
              model: { provider: suggested.provider, id: suggested.id },
            };
        }
      }
      if (!target) {
        finish("kept current: discovery did not select an allowed model");
        return;
      }
      decision.to = modelKey(target);
      if (!valid()) return;
      const blocked = selectionIssue(ctx, target, prompt, images);
      if (blocked) {
        finish(`kept current: ${blocked}`);
        return;
      }
      if (test || mode === "shadow") {
        finish(`would use ${decision.role}${learn ? "; would save role" : ""}`);
        return;
      }
      if (
        !(await switchModel(ctx, target, role?.thinking ?? learn?.thinking))
      ) {
        finish("kept current: model unavailable or authentication failed");
        return;
      }
      if (
        controller.signal.aborted ||
        mode !== "auto" ||
        pinned ||
        !sameModel(target, ctx.model)
      )
        return;
      roleDisplay.show(ctx, target, learn?.label ?? roleLabel ?? "New task");
      if (learn) {
        try {
          save(withRole(learn));
        } catch {
          finish(
            "model selected; role was not saved because config changed or could not be written",
          );
          return;
        }
      }
      finish(
        learn
          ? `selected ${learn.label}; saved role`
          : `selected ${decision.role}`,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        // Error strings from fetch implementations can contain private request details.
        const message =
          error instanceof Error &&
          /^(Jev HTTP|Invalid Jev|Empty Jev|Inconsistent Jev|Jev response|Invalid router config)/.test(
            error.message,
          )
            ? error.message
            : "request failed or timed out";
        finish(`kept current: ${message}`);
      }
    } finally {
      if (active === controller) active = undefined;
      status(ctx);
    }
  }
  async function setMode(ctx: ExtensionContext, next: Mode) {
    if (next === "off") {
      stop(ctx);
      notify(ctx, "Jev routing is off.");
      return;
    }
    if (!(await allowNetwork(ctx))) return;
    mode = next;
    pinned = false;
    if (next !== "auto") roleDisplay.clear(ctx);
    status(ctx);
    notify(
      ctx,
      `Jev ${mode} mode is on for this session. /router off stops routing.`,
    );
  }
  async function menu(ctx: ExtensionCommandContext) {
    while (true) {
      const action = await pick(
        ctx,
        `Jev router: ${mode}${pinned ? " (manual pin)" : ""}`,
        [
          {
            value: "roles",
            label: "Configure task roles",
            description:
              "Pick models for fast, implementation, review, planning, questions, and more.",
          },
          {
            value: "shadow",
            label: "Start shadow mode",
            description:
              "Ask Jev, but keep your model and saved roles unchanged.",
          },
          {
            value: "auto",
            label: "Start automatic routing",
            description: "Let Jev pick a model for each new request.",
          },
          { value: "off", label: "Turn routing off" },
          {
            value: "new",
            label: "New task behavior",
            description: config.newRole,
          },
          {
            value: "pool",
            label: "Allowed discovery models",
            description: `${config.autoModels.length} models. Assigned role models join this list.`,
          },
          { value: "explain", label: "Explain last decision" },
          {
            value: "test",
            label: "Test a public task",
            description:
              "Ask Jev without running the task or switching models.",
          },
        ],
      );
      if (!action) return;
      await command(action, ctx);
    }
  }
  async function command(args: string, ctx: ExtensionCommandContext) {
    const [action, ...rest] = args.trim().split(/\s+/);
    if (action === "off") {
      stop(ctx);
      return;
    }
    if (action === "explain") {
      explain(ctx);
      return;
    }
    if (ctx.mode !== "tui") {
      notify(ctx, "Configure this prototype in interactive pi.", "warning");
      return;
    }
    if (!ctx.isIdle() || active) {
      notify(
        ctx,
        "Wait for the current request to finish. /router off is always available.",
        "warning",
      );
      return;
    }
    load();
    if (action === "shadow" || action === "auto") await setMode(ctx, action);
    else if (action === "roles") await rolesMenu(ctx);
    else if (action === "pool") await poolMenu(ctx);
    else if (action === "new") await discoveryMenu(ctx);
    else if (action === "test") {
      const prompt = rest.length
        ? rest.join(" ")
        : await ctx.ui.input(
            "Public task to classify (not executed)",
            "Write a README for a public calculator project",
          );
      if (prompt && (await allowNetwork(ctx))) {
        await route(ctx, prompt, false, true);
        explain(ctx);
      }
    } else if (!action) await menu(ctx);
    else
      notify(
        ctx,
        "Use /router [roles|pool|new|shadow|auto|off|test|explain].",
        "warning",
      );
  }
  pi.registerCommand("router", {
    description: "Configure Jev task roles and model routing",
    getArgumentCompletions(prefix) {
      return [
        "roles",
        "pool",
        "new",
        "shadow",
        "auto",
        "off",
        "test",
        "explain",
      ]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      try {
        await command(args, ctx);
      } catch (error) {
        notify(
          ctx,
          error instanceof Error ? error.message : "Router command failed.",
          "error",
        );
      }
    },
  });
  pi.on("session_start", (_event, ctx) => {
    active?.abort();
    roleDisplay.clear(ctx);
    mode = ctx.mode === "tui" ? "auto" : "off";
    consent = false;
    pinned = false;
    pendingInput = undefined;
    last = undefined;
    try {
      load();
    } catch (error) {
      notify(ctx, (error as Error).message, "error");
    }
    status(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    stop(ctx);
    consent = false;
  });
  pi.on("session_tree", (_event, ctx) => {
    stop(ctx);
    pinned = false;
    last = undefined;
  });
  pi.on("input", (event) => {
    pendingInput =
      event.source !== "extension" && !event.streamingBehavior
        ? event.text
        : undefined;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const prompt = pendingInput;
    pendingInput = undefined;
    if (mode === "off" || pinned || prompt === undefined) return;
    if (!consent && !(await allowNetwork(ctx))) {
      stop(ctx);
      return;
    }
    if (!["auto", "shadow"].includes(mode) || pinned) return;
    await route(ctx, prompt, !!event.images?.length);
  });
  pi.on("model_select", (event, ctx) => {
    if (applying) return;
    roleDisplay.clear(ctx);
    if (event.source === "restore" || mode === "off") return;
    pinned = true;
    active?.abort();
    status(ctx);
    notify(
      ctx,
      "Manual model choice pinned. /router auto or /router shadow resumes routing.",
    );
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    if (applying) return;
    roleDisplay.clear(ctx);
    if (mode === "off") return;
    pinned = true;
    active?.abort();
    status(ctx);
  });
}
