import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRouter } from "../extension.ts";
import { defaults, KEEP, NEW, type Config, type Candidate } from "../core.ts";

const first: Candidate = {
  provider: "test",
  id: "current",
  name: "Current",
  contextWindow: 200000,
  input: ["text", "image"],
  reasoning: true,
  cost: { input: 1, output: 2 },
};
const second: Candidate = { ...first, id: "second", name: "Second" };
function harness(config: Config = defaults()) {
  const dir = mkdtempSync(join(tmpdir(), "jev-extension-"));
  const path = join(dir, "jev-router.json");
  writeFileSync(path, JSON.stringify(config));
  const handlers = new Map<string, Function>();
  let handler: Function;
  let current = first;
  let apiKey: string | undefined = "test-key";
  let idle = true;
  let auth = true;
  let thinking = "medium";
  let uiMode = "tui";
  let scope: { model: Candidate }[] = [];
  let models = [first, second];
  let entries: unknown[] = [];
  let tokenCount: number | null = 1000;
  let fetchOverride: typeof fetch | undefined;
  const records: any[] = [];
  const requests: any[] = [];
  const notifications: string[] = [];
  const picks: (string | undefined)[] = [];
  const confirms: boolean[] = [];
  const choices: Record<
    string,
    {
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  >[] = [];
  const switches: Candidate[] = [];
  const statuses = new Map<string, string>();
  let footer: { render(width: number): string[]; dispose?(): void } | undefined;
  let footerInstalls = 0;
  let branchUnsubscribes = 0;
  let pickerCalls = 0;
  const ctx: any = {
    mode: uiMode,
    hasUI: true,
    cwd: dir,
    get model() {
      return current;
    },
    get thinkingLevel() {
      return thinking;
    },
    modelRegistry: { getAvailable: () => models, isUsingOAuth: () => false },
    get scopedModels() {
      return scope;
    },
    getContextUsage: () => ({ tokens: tokenCount }),
    getSystemPrompt: () => "DO NOT SEND: private system prompt",
    isIdle: () => idle,
    sessionManager: {
      buildContextEntries: () => entries,
      getEntries: () => entries,
      getSessionName: () => undefined,
    },
    ui: {
      notify: (message: string) => notifications.push(message),
      setStatus: (key: string, value: string | undefined) => {
        if (value === undefined) statuses.delete(key);
        else statuses.set(key, value);
      },
      setFooter: (factory: Function | undefined) => {
        footer?.dispose?.();
        footer = undefined;
        if (factory) {
          footerInstalls++;
          footer = factory(
            { requestRender() {} },
            { fg: (_color: string, text: string) => text },
            {
              getGitBranch: () => "test-branch",
              getAvailableProviderCount: () => 1,
              getExtensionStatuses: () => statuses,
              onBranchChange: () => () => {
                branchUnsubscribes++;
              },
            },
          );
        }
      },
      confirm: async () => (confirms.length ? confirms.shift() : true),
      input: async () => undefined,
      editor: async () => undefined,
    },
  };
  const pi: any = {
    on: (event: string, fn: Function) => handlers.set(event, fn),
    registerCommand: (_name: string, def: any) => {
      handler = def.handler;
    },
    appendEntry: (_type: string, data: any) =>
      records.push(structuredClone(data)),
    getAllTools: () => [
      { name: "read", parameters: { description: "DO NOT SEND: tool schema" } },
    ],
    getActiveTools: () => ["read"],
    setModel: async (model: Candidate) => {
      if (!auth) return false;
      switches.push(model);
      current = model;
      await handlers.get("model_select")?.({ source: "set", model }, ctx);
      return true;
    },
    setThinkingLevel: (level: string) => {
      thinking = level;
      handlers.get("thinking_level_select")?.({ level }, ctx);
    },
  };
  const fetcher: typeof fetch = async (url, init) => {
    if (fetchOverride) return fetchOverride(url, init);
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const selected = choices.shift() ?? {};
    return Response.json({
      model: "jev-test",
      usage: { input_tokens: 123, output_tokens: 10 },
      answers: Object.fromEntries(
        Object.entries(body.questions).map(([id, question]: [string, any]) => {
          const choice =
            selected[id]?.choice ?? Object.keys(question.criteria)[0];
          return [
            id,
            {
              type: "choice",
              choice,
              confidence: selected[id]?.confidence ?? 0.99,
              probabilities:
                selected[id]?.probabilities ??
                Object.fromEntries(
                  Object.keys(question.criteria).map((option) => [
                    option,
                    option === choice ? 1 : 0,
                  ]),
                ),
            },
          ];
        }),
      ),
    });
  };
  registerRouter(pi, {
    configPath: path,
    apiKey: () => apiKey,
    fetcher,
    pick: async () => {
      pickerCalls++;
      return picks.shift();
    },
  });
  const emit = async (event: string, data: any = {}) =>
    handlers.get(event)?.(data, ctx);
  return {
    records,
    requests,
    notifications,
    configPath: path,
    footerLines: (width = 120) => footer?.render(width) ?? [],
    get footerInstalls() {
      return footerInstalls;
    },
    get branchUnsubscribes() {
      return branchUnsubscribes;
    },
    picks,
    confirms,
    choices,
    switches,
    ctx,
    emit,
    command: (args: string) => handler(args, ctx),
    prompt: async (text = "Implement a public calculator", expanded = text) => {
      await emit("input", { text, source: "interactive" });
      await emit("before_agent_start", { prompt: expanded });
    },
    setup: () => emit("session_start"),
    readConfig: () => JSON.parse(readFileSync(path, "utf8")) as Config,
    setKey: (value?: string) => {
      apiKey = value;
    },
    setAuth: (value: boolean) => {
      auth = value;
    },
    setModels: (value: Candidate[]) => {
      models = value;
    },
    setScope: (value: { model: Candidate }[]) => {
      scope = value;
    },
    setTokens: (value: number | null) => {
      tokenCount = value;
    },
    setEntries: (value: unknown[]) => {
      entries = value;
    },
    setFetch: (value: typeof fetch) => {
      fetchOverride = value;
    },
    setIdle: (value: boolean) => {
      idle = value;
    },
    get thinking() {
      return thinking;
    },
    get pickerCalls() {
      return pickerCalls;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
function configured() {
  const config = defaults();
  config.roles[1].model = { provider: second.provider, id: second.id };
  config.roles[1].thinking = "high";
  config.autoModels = [second];
  return config;
}

test("default auto sends nothing at startup or after declined consent", async (t) => {
  const h = harness();
  t.after(h.cleanup);
  await h.setup();
  assert.equal(h.requests.length, 0);
  h.confirms.push(false);
  await h.prompt();
  await h.prompt();
  assert.equal(h.requests.length, 0);
  h.confirms.push(false);
  await h.command("shadow");
  await h.prompt();
  assert.equal(h.requests.length, 0);
  h.setKey(undefined);
  await h.command("auto");
  await h.prompt();
  assert.equal(h.requests.length, 0);
});
test("default auto applies a role after consent without an auto command", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.equal(h.requests.length, 1);
  assert.equal(h.switches[0]?.id, "second");
  assert.equal(h.thinking, "high");
  h.confirms.push(false);
  await h.prompt();
  assert.equal(h.requests.length, 2, "consent is reused within the session");
  assert.equal(h.confirms.length, 1);
  await h.command("off");
  await h.prompt();
  assert.equal(h.requests.length, 2);
});
test("persistent TypeSafe consent skips prompts across session starts", async (t) => {
  const config = configured();
  config.typeSafeConsent = true;
  const h = harness(config);
  t.after(h.cleanup);
  h.confirms.push(false, false);
  await h.setup();
  h.choices.push({ route: { choice: KEEP } });
  await h.prompt();
  assert.equal(h.requests.length, 1);
  await h.emit("session_shutdown");
  await h.setup();
  h.choices.push({ route: { choice: KEEP } });
  await h.prompt();
  assert.equal(h.requests.length, 2);
  assert.equal(h.confirms.length, 2, "persistent consent skips both prompts");
});
test("default auto requires a key and remains off in headless modes", async (t) => {
  for (const mode of ["tui", "rpc", "print"]) {
    const h = harness(configured());
    t.after(h.cleanup);
    h.ctx.mode = mode;
    if (mode === "tui") h.setKey(undefined);
    await h.setup();
    await h.prompt();
    assert.equal(h.requests.length, 0);
    assert.equal(h.switches.length, 0);
  }
});
test("shadow records a choice without switching, changing thinking, or learning", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("shadow");
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.equal(h.records.at(-1).to, "test/second");
  assert.equal(h.switches.length, 0);
  assert.equal(h.thinking, "medium");
  assert.deepEqual(h.readConfig(), configured());
});
test("auto applies role model and thinking before the agent starts", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.equal(h.switches[0].id, "second");
  assert.equal(h.thinking, "high");
  h.choices.push({ route: { choice: KEEP } });
  await h.prompt();
  assert.equal(
    h.requests.length,
    2,
    "router's own model event must not pin routing",
  );
});
test("Implement the plan applies the winning Coding role at 0.52 confidence", async (t) => {
  const config = configured();
  for (const role of config.roles) role.model ??= first;
  config.roles.push({
    id: "documentation",
    label: "Documentation",
    criteria: "Write documentation.",
    model: second,
  });
  const h = harness({ ...config, confidence: 0.99 } as Config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push({
    route: {
      choice: "coding",
      confidence: 0.52,
      probabilities: {
        fast: 0,
        coding: 0.57,
        review: 0,
        planning: 0.01,
        qa: 0,
        documentation: 0,
        [KEEP]: 0.41,
        [NEW]: 0.01,
      },
    },
  });
  await h.prompt("Implement the plan");
  assert.equal(h.requests.length, 1);
  assert.equal(h.switches[0]?.id, "second");
  assert.equal(h.thinking, "high");
  assert.equal(h.records.at(-1).outcome, "selected coding");
  assert.equal(h.records.at(-1).confidence, 0.52);
});
test("zero confidence does not block the top-ranked resolved role", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push({ route: { choice: "coding", confidence: 0 } });
  await h.prompt();
  assert.equal(h.switches[0]?.id, "second");
  assert.equal(h.thinking, "high");
});
test("keep current preserves the model and thinking regardless of confidence", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push({ route: { choice: KEEP, confidence: 0 } });
  await h.prompt();
  assert.equal(h.switches.length, 0);
  assert.equal(h.thinking, "medium");
  assert.equal(h.records.at(-1).outcome, "kept current");
});
test("unresolved or unknown winning choices keep the current model", async (t) => {
  for (const choice of ["coding", "unknown_role"]) {
    const config = configured();
    config.roles[1].model = { provider: "test", id: "missing" };
    const h = harness(config);
    t.after(h.cleanup);
    await h.setup();
    await h.command("auto");
    h.choices.push({ route: { choice, confidence: 1 } });
    await h.prompt();
    assert.equal(h.switches.length, 0);
    assert.equal(h.thinking, "medium");
    assert.deepEqual(h.readConfig(), config);
    assert.match(
      h.records.at(-1).outcome,
      choice === "coding" ? /unavailable/ : /Invalid Jev choice/,
    );
  }
});
test("shadow and test report low-confidence winners without applying them", async (t) => {
  for (const mode of ["shadow", "test"]) {
    const h = harness(configured());
    t.after(h.cleanup);
    await h.setup();
    h.choices.push({ route: { choice: "coding", confidence: 0.1 } });
    if (mode === "shadow") {
      await h.command("shadow");
      await h.prompt();
    } else {
      await h.command("test Implement a public calculator");
    }
    assert.equal(h.records.at(-1).outcome, "would use coding");
    assert.equal(h.records.at(-1).confidence, 0.1);
    assert.equal(h.switches.length, 0);
    assert.equal(h.thinking, "medium");
  }
});
test("sends raw input only, never expanded instructions, history, or tool output", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("shadow");
  h.setEntries([
    {
      type: "message",
      message: {
        role: "toolResult",
        content: [{ type: "text", text: "PRIVATE LOG" }],
      },
    },
  ]);
  await h.prompt("/skill:public-example", "PRIVATE EXPANDED SKILL");
  const serialized = JSON.stringify(h.requests);
  assert.ok(serialized.includes("/skill:public-example"));
  for (const forbidden of ["PRIVATE LOG", "PRIVATE EXPANDED", "DO NOT SEND"])
    assert.ok(!serialized.includes(forbidden));
  assert.ok(!JSON.stringify(h.records).includes("/skill:public-example"));
});
test("manual model or thinking choice pins routing until re-enabled", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  await h.emit("model_select", { source: "cycle", model: first });
  await h.prompt();
  assert.equal(h.requests.length, 0);
  await h.command("shadow");
  await h.prompt();
  assert.equal(h.requests.length, 1);
  await h.emit("thinking_level_select", { level: "low" });
  await h.prompt();
  assert.equal(h.requests.length, 1);
});
test("extension inputs and queued steering do not reroute", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  await h.emit("input", { source: "extension", text: "helper" });
  await h.emit("before_agent_start", { prompt: "helper" });
  await h.emit("input", {
    source: "interactive",
    streamingBehavior: "steer",
    text: "helper",
  });
  await h.emit("before_agent_start", { prompt: "helper" });
  assert.equal(h.requests.length, 0);
});
test("new-model auto discovery saves a recognized role and reuses it", async (t) => {
  const config = configured();
  config.newRole = "auto";
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  await h.prompt("Write a README for a public calculator");
  assert.ok(
    h.requests[0].questions.route.criteria[NEW].missing_profiles.some(
      (profile: { label: string }) => profile.label === "Documentation",
    ),
  );
  assert.equal(h.switches[0].id, "second");
  assert.equal(
    h.readConfig().roles.find((role) => role.id === "documentation")?.model?.id,
    "second",
  );
  h.choices.push({ route: { choice: "documentation" } });
  await h.prompt("Write another public README");
  assert.ok(h.requests.at(-1).questions.route.criteria.documentation);
});
test("unknown tasks get a one-off model without inventing saved criteria", async (t) => {
  const config = configured();
  config.newRole = "auto";
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "other" }, model: { choice: "model_0" } },
  );
  await h.prompt("A novel public task");
  assert.equal(h.switches.length, 1);
  assert.equal(h.readConfig().roles.length, 5);
});
test("shadow discovery never prompts, saves a role, or switches", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("shadow");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  await h.prompt();
  assert.equal(h.pickerCalls, 0);
  assert.equal(h.switches.length, 0);
  assert.equal(h.readConfig().roles.length, 5);
});
test("ask discovery can use the suggestion and remember the role", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  h.picks.push("suggested");
  h.confirms.push(true);
  await h.prompt();
  assert.equal(h.switches.length, 1);
  assert.ok(h.readConfig().roles.find((role) => role.id === "documentation"));
});
test("cancelled new-model selection keeps the current model", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  h.picks.push(undefined);
  await h.prompt();
  assert.equal(h.switches.length, 0);
  assert.equal(h.readConfig().roles.length, 5);
});
test("failed model authentication never saves a learned role", async (t) => {
  const config = configured();
  config.newRole = "auto";
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setAuth(false);
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  await h.prompt();
  assert.equal(h.switches.length, 0);
  assert.equal(h.readConfig().roles.length, 5);
});
test("assigned roles remain visible even when their models fail scope or context checks", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("shadow");
  h.setScope([{ model: first }]);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.ok(h.requests.at(-1).questions.route.criteria.coding);
  assert.match(
    h.records.at(-1).outcome,
    /unavailable or outside the session model scope/,
  );
  h.setScope([]);
  h.setTokens(195000);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.ok(h.requests.at(-1).questions.route.criteria.coding);
  assert.match(h.records.at(-1).outcome, /context window/);
  assert.equal(h.switches.length, 0);
});
test("planning and review can change thinking on the current model near its context limit", async (t) => {
  const config = configured();
  for (const id of ["planning", "review"]) {
    const role = config.roles.find((role) => role.id === id)!;
    role.model = first;
    role.thinking = "max";
  }
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setTokens(195000);
  h.ctx.getSystemPrompt = () => "x".repeat(120000);
  h.choices.push({ route: { choice: "planning" } });
  await h.prompt("Write a plan to normalize a public example database");
  const offered = h.requests[0].questions.route.criteria;
  assert.ok(offered.planning);
  assert.ok(offered.review);
  assert.equal(h.thinking, "max");
  assert.equal(h.switches.length, 0);
  assert.equal(h.records.at(-1).outcome, "selected planning");
});
test("measured context usage does not count the system prompt and tools twice", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setTokens(100000);
  h.setEntries([
    {
      type: "message",
      message: {
        role: "assistant",
        stopReason: "stop",
        usage: { input: 100000 },
      },
    },
  ]);
  h.ctx.getSystemPrompt = () => "x".repeat(120000);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.equal(h.switches[0]?.id, "second");
});
test("auto blocks a different model that cannot fit the conversation", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setTokens(195000);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.ok(h.requests[0].questions.route.criteria.coding);
  assert.match(h.records.at(-1).outcome, /context window/);
  assert.equal(h.switches.length, 0);
  assert.equal(h.thinking, "medium");
});
test("auto blocks a text-only target when retained history has images", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setModels([first, { ...second, input: ["text"] }]);
  h.setEntries([
    {
      type: "message",
      message: { role: "user", content: [{ type: "image" }] },
    },
  ]);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.ok(h.requests[0].questions.route.criteria.coding);
  assert.match(h.records.at(-1).outcome, /does not support images/);
  assert.equal(h.switches.length, 0);
});
test("current model can change thinking without reselecting it from the model scope", async (t) => {
  const config = configured();
  config.roles.find((role) => role.id === "planning")!.model = first;
  config.roles.find((role) => role.id === "planning")!.thinking = "max";
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setScope([{ model: second }]);
  h.setTokens(null);
  h.setEntries([{ type: "compaction" }]);
  h.choices.push({ route: { choice: "planning" } });
  await h.prompt();
  assert.equal(h.thinking, "max");
  assert.equal(h.switches.length, 0);
});
test("timeouts and malformed replies keep the current model without leaking errors", async (t) => {
  const config = configured();
  config.timeoutMs = 100;
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setFetch(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("PRIVATE REQUEST")),
          200,
        );
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("PRIVATE REQUEST"));
          },
          { once: true },
        );
      }),
  );
  await h.prompt();
  assert.equal(h.switches.length, 0);
  assert.ok(!JSON.stringify(h.records).includes("PRIVATE REQUEST"));
  h.setFetch(async () => Response.json({ answers: {} }));
  await h.prompt();
  assert.equal(h.switches.length, 0);
});
test("turning routing off cancels in-flight routing", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.setFetch(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
        started();
      }),
  );
  const running = h.prompt();
  await waiting;
  await h.command("off");
  await running;
  assert.equal(h.switches.length, 0);
  assert.equal(h.records.length, 0);
});
test("tree navigation disables routing; reload restores auto with fresh consent", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  await h.emit("session_tree");
  await h.prompt();
  assert.equal(h.requests.length, 0);
  await h.command("auto");
  await h.emit("session_shutdown");
  await h.setup();
  h.confirms.push(false);
  await h.prompt();
  assert.equal(h.requests.length, 0);
  await h.setup();
  await h.prompt();
  assert.equal(h.requests.length, 1);
});
test("test command classifies without running an agent or changing models", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  h.choices.push({ route: { choice: "coding" } });
  await h.command("off");
  await h.command("test Implement a public calculator");
  assert.equal(h.records.at(-1).mode, "test");
  assert.equal(h.switches.length, 0);
  await h.prompt();
  assert.equal(h.requests.length, 1, "test must not enable routing");
});
test("role picker saves a model, thinking level, and discovery permission", async (t) => {
  const h = harness();
  t.after(h.cleanup);
  await h.setup();
  h.picks.push("coding", "model", "test/second", "high", undefined);
  await h.command("roles");
  const saved = h.readConfig();
  assert.equal(
    saved.roles.find((role) => role.id === "coding")?.model?.id,
    "second",
  );
  assert.equal(
    saved.roles.find((role) => role.id === "coding")?.thinking,
    "high",
  );
  assert.equal(saved.autoModels[0].id, "second");
  assert.equal(h.requests.length, 0);
});
test("ask mode supports discovery without an automatic model pool", async (t) => {
  const h = harness();
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" } },
  );
  h.picks.push("pick", "test/second");
  await h.prompt();
  assert.equal(h.requests[1].questions.model, undefined);
  assert.equal(h.switches[0].id, "second");
  assert.ok(h.readConfig().roles.find((role) => role.id === "documentation"));
});
test("ask mode can name and save an unknown role after a successful switch", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.ctx.ui.input = async () => "Translation";
  h.ctx.ui.editor = async () =>
    "Translate prose between languages while preserving meaning.";
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "other" }, model: { choice: "model_0" } },
  );
  h.picks.push("suggested", "low");
  await h.prompt("Translate a public poem");
  const learned = h
    .readConfig()
    .roles.find((role) => role.id === "translation");
  assert.equal(learned?.model?.id, "second");
  assert.equal(learned?.thinking, "low");
  assert.equal(h.thinking, "low");
  assert.match(h.footerLines()[1], /Jev: Translation$/);
});
test("discovery applies its top model and saves a recognized role without a confidence cutoff", async (t) => {
  const config = configured();
  config.newRole = "auto";
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW, confidence: 0.1 } },
    {
      profile: { choice: "documentation", confidence: 0.2 },
      model: { choice: "model_0", confidence: 0.3 },
    },
  );
  await h.prompt();
  assert.equal(h.switches[0]?.id, "second");
  assert.equal(
    h.readConfig().roles.find((role) => role.id === "documentation")?.model?.id,
    "second",
  );
  assert.equal(h.records.at(-1).confidence, 0.3);
});
test("ask discovery offers its top model even when confidence is low", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: NEW, confidence: 0.1 } },
    {
      profile: { choice: "other", confidence: 0 },
      model: { choice: "model_0", confidence: 0.2 },
    },
  );
  h.picks.push("suggested");
  h.confirms.push(false);
  await h.prompt();
  assert.equal(h.switches[0]?.id, "second");
  assert.equal(h.readConfig().roles.length, 5);
});
test("discovery without a resolved model keeps the current model and saves no role", async (t) => {
  for (const choice of [KEEP, "model_99"]) {
    const config = configured();
    config.newRole = "auto";
    const h = harness(config);
    t.after(h.cleanup);
    await h.setup();
    await h.command("auto");
    h.choices.push(
      { route: { choice: NEW } },
      {
        profile: { choice: "documentation" },
        model: { choice, confidence: 1 },
      },
    );
    await h.prompt();
    assert.equal(h.switches.length, 0);
    assert.equal(h.thinking, "medium");
    assert.deepEqual(h.readConfig(), config);
    assert.match(h.records.at(-1).outcome, /kept current/);
  }
});
test("the model footer shows the role only after the router applies it", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  assert.deepEqual(h.footerLines(), []);
  h.choices.push({ route: { choice: "coding", confidence: 0.1 } });
  await h.prompt();
  assert.match(h.footerLines()[1], /second.*high.*Jev: Coding implementation$/);
  assert.equal(h.footerInstalls, 1);
  assert.ok(h.footerLines().some((line) => line.includes("Jev: auto")));
});
test("same-model role changes update the footer without replacing it", async (t) => {
  const config = configured();
  for (const id of ["planning", "review"]) {
    const role = config.roles.find((item) => item.id === id)!;
    role.model = first;
    role.thinking = "max";
  }
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: "planning" } },
    { route: { choice: "review" } },
  );
  await h.prompt();
  assert.match(h.footerLines()[1], /current.*max.*Jev: Planning$/);
  await h.prompt();
  assert.match(h.footerLines()[1], /current.*max.*Jev: Review$/);
  assert.equal(h.switches.length, 0);
  assert.equal(h.footerInstalls, 1);
});
test("keep current and failed choices preserve the last applied role label", async (t) => {
  const config = configured();
  config.roles.find((role) => role.id === "planning")!.model = {
    provider: "test",
    id: "missing",
  };
  const h = harness(config);
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push(
    { route: { choice: "coding" } },
    { route: { choice: KEEP } },
    { route: { choice: "planning" } },
  );
  await h.prompt();
  await h.prompt();
  assert.match(h.footerLines()[1], /Jev: Coding implementation$/);
  await h.prompt();
  assert.match(h.records.at(-1).outcome, /unavailable/);
  assert.match(h.footerLines()[1], /Jev: Coding implementation$/);
});
test("shadow and test recommendations do not become applied role labels", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("shadow");
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.deepEqual(h.footerLines(), []);
  await h.command("auto");
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  h.choices.push({ route: { choice: KEEP } });
  await h.command("test Continue");
  assert.match(h.footerLines()[1], /Jev: Coding implementation$/);
  await h.command("shadow");
  assert.deepEqual(h.footerLines(), []);
});
test("manual changes and session resets clear the role label and release the footer", async (t) => {
  for (const event of [
    "model_select",
    "thinking_level_select",
    "session_tree",
    "session_shutdown",
    "session_start",
    "off",
  ]) {
    const h = harness(configured());
    t.after(h.cleanup);
    await h.setup();
    await h.command("auto");
    h.choices.push({ route: { choice: "coding" } });
    await h.prompt();
    assert.equal(h.footerInstalls, 1);
    if (event === "off") await h.command("off");
    else await h.emit(event, { source: "cycle", model: first, level: "low" });
    assert.deepEqual(h.footerLines(), [], event);
    assert.equal(h.branchUnsubscribes, 1, event);
  }
});
test("discovery shows the recognized role without requiring it to be saved", async (t) => {
  for (const profile of ["documentation", "other"]) {
    const h = harness(configured());
    t.after(h.cleanup);
    await h.setup();
    await h.command("auto");
    h.choices.push(
      { route: { choice: NEW } },
      { profile: { choice: profile }, model: { choice: "model_0" } },
    );
    h.picks.push("suggested");
    h.confirms.push(false);
    await h.prompt();
    assert.match(
      h.footerLines()[1],
      profile === "documentation" ? /Jev: Documentation$/ : /Jev: New task$/,
    );
    assert.equal(h.readConfig().roles.length, 5);
  }
});
test("a failed role save still labels the model that the router applied", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.ctx.ui.confirm = async () => {
    writeFileSync(
      h.configPath,
      JSON.stringify({ ...h.readConfig(), timeoutMs: 4000 }),
    );
    return true;
  };
  h.choices.push(
    { route: { choice: NEW } },
    { profile: { choice: "documentation" }, model: { choice: "model_0" } },
  );
  h.picks.push("suggested");
  await h.prompt();
  assert.match(h.records.at(-1).outcome, /model selected; role was not saved/);
  assert.match(h.footerLines()[1], /Jev: Documentation$/);
});
test("clearing the role does not remove a footer installed later by another extension", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  h.ctx.ui.setFooter(() => ({ render: () => ["another footer"] }));
  await h.command("off");
  assert.deepEqual(h.footerLines(), ["another footer"]);
  assert.equal(h.branchUnsubscribes, 1);
});
test("failed authentication never adds a role label", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  h.setAuth(false);
  h.choices.push({ route: { choice: "coding" } });
  await h.prompt();
  assert.deepEqual(h.footerLines(), []);
});
test("oversize input is not sent or routed", async (t) => {
  const h = harness(configured());
  t.after(h.cleanup);
  await h.setup();
  await h.command("auto");
  await h.prompt("x".repeat(8001));
  assert.equal(h.requests.length, 0);
});
