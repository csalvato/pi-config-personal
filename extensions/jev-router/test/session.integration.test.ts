import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { registerRouter } from "../extension.ts";
import { defaults, type Config } from "../core.ts";

function configured() {
  const config = defaults();
  config.roles[1].model = { provider: "qa-provider", id: "implementation" };
  config.roles[1].thinking = "high";
  config.roles[3].model = { provider: "qa-provider", id: "planner" };
  config.roles[3].thinking = "max";
  config.autoModels = [
    { provider: "qa-provider", id: "implementation" },
    { provider: "qa-provider", id: "planner" },
  ];
  return config;
}

function routerResponse(body: any, choices: Array<Record<string, string>>) {
  const selected = choices.shift() ?? {};
  return Response.json({
    model: "jev-test",
    answers: Object.fromEntries(
      Object.entries(body.questions).map(([name, question]: [string, any]) => {
        const choice = selected[name] ?? Object.keys(question.criteria)[0];
        return [
          name,
          {
            type: "choice",
            choice,
            confidence: 0.1,
            probabilities: Object.fromEntries(
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
}

function ui(): ExtensionUIContext {
  return {
    select: async () => undefined,
    confirm: async () => true,
    input: async () => undefined,
    notify() {},
    onTerminalInput: () => () => {},
    setStatus() {},
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setWidget() {},
    setFooter() {},
    setHeader() {},
    setTitle() {},
    custom: async () => undefined as never,
    pasteToEditor() {},
    setEditorText() {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider() {},
    setEditorComponent() {},
    getEditorComponent: () => undefined,
    theme: {} as any,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: true }),
    getToolsExpanded: () => false,
    setToolsExpanded() {},
  };
}

async function harness(
  config: Config = configured(),
  options: {
    inputTransformer?: (pi: ExtensionAPI) => void;
    routerFirst?: boolean;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "jev-real-session-"));
  const configPath = join(dir, "jev-router.json");
  writeFileSync(configPath, JSON.stringify(config));
  const providerRequests: any[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    providerRequests.push(JSON.parse(raw));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({
        id: "test-response",
        object: "chat.completion.chunk",
        created: 0,
        model: providerRequests.at(-1).model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "acknowledged" },
            finish_reason: null,
          },
        ],
      })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({
        id: "test-response",
        object: "chat.completion.chunk",
        created: 0,
        model: providerRequests.at(-1).model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const routerRequests: any[] = [];
  const choices: Array<Record<string, string>> = [];
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
  });
  runtime.registerProvider("qa-provider", {
    name: "QA provider",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "test-key",
    api: "openai-completions",
    models: [
      {
        id: "planner",
        name: "Planner",
        reasoning: true,
        thinkingLevelMap: { medium: "medium", high: "high", max: "max" },
        compat: { supportsReasoningEffort: true },
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 272000,
        maxTokens: 4096,
      },
      {
        id: "implementation",
        name: "Implementation",
        reasoning: true,
        thinkingLevelMap: { medium: "medium", high: "high" },
        compat: { supportsReasoningEffort: true },
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1050000,
        maxTokens: 4096,
      },
    ],
  });
  const planner = runtime.getModel("qa-provider", "planner")!;
  const routerFactory = (pi: ExtensionAPI) =>
    registerRouter(pi, {
      configPath,
      apiKey: () => "test-key",
      pick: async () => "suggested",
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        routerRequests.push(body);
        return routerResponse(body, choices);
      },
    });
  const loader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    settingsManager: SettingsManager.inMemory({ packages: [] }),
    extensionFactories: [
      ...(options.routerFirst !== false ? [routerFactory] : []),
      ...(options.inputTransformer ? [options.inputTransformer] : []),
      ...(options.routerFirst === false ? [routerFactory] : []),
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "PRIVATE SYSTEM MARKER",
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    modelRuntime: runtime,
    model: planner,
    thinkingLevel: "medium",
    noTools: "all",
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ packages: [] }),
    resourceLoader: loader,
  });
  await session.bindExtensions({ mode: "tui", uiContext: ui() });
  return {
    session,
    configPath,
    choices,
    routerRequests,
    providerRequests,
    extensionsResult,
    cleanup: async () => {
      session.dispose();
      server.close();
      await once(server, "close");
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("real AgentSession sends the router-selected implementation model and thinking level to its provider", async (t) => {
  const h = await harness();
  t.after(h.cleanup);
  assert.deepEqual(h.extensionsResult.errors, []);
  await h.session.prompt("/router auto");
  h.choices.push({ route: "coding" });
  await h.session.prompt("Implement a public calculator");
  await h.session.waitForIdle();
  assert.equal(h.routerRequests.length, 1);
  assert.equal(
    h.routerRequests[0].state.request,
    "Implement a public calculator",
  );
  assert.equal(h.session.model?.id, "implementation");
  assert.equal(h.session.thinkingLevel, "high");
  assert.equal(h.providerRequests.length, 1);
  assert.equal(h.providerRequests[0].model, "implementation");
  assert.equal(h.providerRequests[0].reasoning_effort, "high");
});

test("real AgentSession keeps the current planner model and applies its max thinking role", async (t) => {
  const h = await harness();
  t.after(h.cleanup);
  await h.session.prompt("/router auto");
  h.choices.push({ route: "planning" });
  await h.session.prompt(
    "Plan a public calculator refactor. Do not implement it.",
  );
  await h.session.waitForIdle();
  assert.equal(h.routerRequests.length, 1);
  assert.equal(h.session.model?.id, "planner");
  assert.equal(h.session.thinkingLevel, "max");
  assert.deepEqual(
    h.providerRequests.map((request) => [
      request.model,
      request.reasoning_effort,
    ]),
    [["planner", "max"]],
  );
});

test("a manual model choice pins real AgentSession routing until auto mode is enabled again", async (t) => {
  const h = await harness();
  t.after(h.cleanup);
  await h.session.prompt("/router auto");
  h.choices.push({ route: "coding" });
  await h.session.prompt("Implement the first public calculator");
  await h.session.waitForIdle();
  const planner = h.session.modelRuntime.getModel("qa-provider", "planner")!;
  await h.session.setModel(planner);
  h.session.setThinkingLevel("max");
  await h.session.prompt("Implement another public calculator");
  await h.session.waitForIdle();
  assert.equal(h.routerRequests.length, 1);
  assert.deepEqual(
    h.providerRequests.map((request) => [
      request.model,
      request.reasoning_effort,
    ]),
    [
      ["implementation", "high"],
      ["planner", "max"],
    ],
  );
  await h.session.prompt("/router auto");
  h.choices.push({ route: "coding" });
  await h.session.prompt("Implement the final public calculator");
  await h.session.waitForIdle();
  assert.equal(h.routerRequests.length, 2);
  assert.deepEqual(
    h.providerRequests.at(-1) && [
      h.providerRequests.at(-1).model,
      h.providerRequests.at(-1).reasoning_effort,
    ],
    ["implementation", "high"],
  );
});

test("real discovery sends the selected model and stores a recognized role after it succeeds", async (t) => {
  const h = await harness();
  t.after(h.cleanup);
  await h.session.prompt("/router auto");
  h.choices.push(
    { route: "pick_new_model" },
    { profile: "documentation", model: "model_1" },
  );
  await h.session.prompt("Write documentation for a public calculator");
  await h.session.waitForIdle();
  assert.equal(h.routerRequests.length, 2);
  assert.equal(
    h.routerRequests[1].questions.model.criteria.model_1.model,
    "qa-provider/implementation",
  );
  assert.equal(h.session.model?.id, "implementation");
  assert.equal(h.session.thinkingLevel, "medium");
  assert.deepEqual(
    h.providerRequests.map((request) => [
      request.model,
      request.reasoning_effort,
    ]),
    [["implementation", "medium"]],
  );
  const saved = JSON.parse(readFileSync(h.configPath, "utf8"));
  assert.equal(
    saved.roles.find((role: any) => role.id === "documentation")?.model?.id,
    "implementation",
  );
});

test("the router receives the original input only when it precedes other input transformers", async (t) => {
  const transformer = (pi: ExtensionAPI) => {
    pi.on("input", (event) =>
      event.text === "PUBLIC INPUT MARKER"
        ? {
            action: "transform",
            text: `${event.text} PRIVATE TRANSFORM MARKER`,
          }
        : undefined,
    );
  };
  for (const routerFirst of [true, false]) {
    const h = await harness(configured(), {
      inputTransformer: transformer,
      routerFirst,
    });
    t.after(h.cleanup);
    await h.session.prompt("/router auto");
    h.choices.push({ route: "coding" });
    await h.session.prompt("PUBLIC INPUT MARKER");
    await h.session.waitForIdle();
    const routed = JSON.stringify(h.routerRequests[0]);
    assert.equal(routed.includes("PRIVATE TRANSFORM MARKER"), !routerFirst);
    assert.ok(
      JSON.stringify(h.providerRequests[0]).includes(
        "PRIVATE TRANSFORM MARKER",
      ),
    );
  }
});

test("router requests contain only the current raw task, not prior turns, system text, or its decision entry", async (t) => {
  const h = await harness();
  t.after(h.cleanup);
  await h.session.prompt("/router auto");
  h.choices.push({ route: "planning" }, { route: "coding" });
  await h.session.prompt("PRIVATE PRIOR TASK MARKER");
  await h.session.waitForIdle();
  await h.session.prompt("PUBLIC CURRENT TASK MARKER");
  await h.session.waitForIdle();
  const serialized = JSON.stringify(h.routerRequests.at(-1));
  assert.match(serialized, /PUBLIC CURRENT TASK MARKER/);
  for (const forbidden of [
    "PRIVATE PRIOR TASK MARKER",
    "PRIVATE SYSTEM MARKER",
    "jev-router-decision",
    "acknowledged",
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});
