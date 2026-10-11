import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  askJev,
  defaults,
  discoveryQuestions,
  eligible,
  missingProfiles,
  KEEP,
  NEW,
  parseConfig,
  routeQuestion,
  validateResult,
  type Candidate,
  type ChoiceQuestion,
} from "../core.ts";
import { ConfigStore } from "../config.ts";

export const model: Candidate = {
  provider: "test",
  id: "coder",
  name: "Coder",
  contextWindow: 200000,
  input: ["text", "image"],
  reasoning: true,
  cost: { input: 1, output: 2 },
};
function answer(questions: Record<string, ChoiceQuestion>) {
  return {
    model: "jev-test",
    answers: Object.fromEntries(
      Object.entries(questions).map(([key, question]) => {
        const choice = Object.keys(question.criteria)[0];
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 1,
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
  };
}
test("default config has five roles and safe discovery settings", () => {
  const config = defaults();
  assert.equal(config.roles.length, 5);
  assert.equal(config.newRole, "ask");
  assert.deepEqual(config.autoModels, []);
  assert.deepEqual(parseConfig(config), config);
  config.roles[0].label = "Changed";
  assert.equal(defaults().roles[0].label, "Fast");
});
test("config rejects unsafe limits, duplicates, reserved names, and malformed models", () => {
  for (const patch of [
    { timeoutMs: 0 },
    { timeoutMs: 31000 },
    { version: 2 },
    { newRole: "anything" },
    { autoModels: [{ provider: "test" }] },
  ]) {
    assert.throws(() => parseConfig({ ...defaults(), ...patch }));
  }
  for (const id of [KEEP, NEW, "other", "__proto__", "two words"]) {
    const config = defaults();
    config.roles[0].id = id;
    assert.throws(() => parseConfig(config));
  }
  const config = defaults();
  config.roles.push(config.roles[0]);
  assert.throws(() => parseConfig(config));
});
test("legacy confidence cutoffs are ignored and removed on the next save", () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-legacy-config-"));
  try {
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ ...defaults(), confidence: 0.99 }));
    const store = new ConfigStore(path);
    const config = store.load();
    assert.equal(Object.hasOwn(config, "confidence"), false);
    assert.deepEqual(config, defaults());
    store.save(config);
    assert.equal(
      Object.hasOwn(JSON.parse(readFileSync(path, "utf8")), "confidence"),
      false,
    );
    for (const confidence of [0, 0.65, 1, null, "obsolete"]) {
      assert.deepEqual(parseConfig({ ...defaults(), confidence }), defaults());
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("model eligibility checks active images and conservative context limits", () => {
  const textOnly = { ...model, id: "text", input: ["text"] };
  const small = { ...model, id: "small", contextWindow: 16000 };
  assert.deepEqual(
    eligible([model, textOnly, small], {
      tokens: 10000,
      currentWindow: 200000,
      extraTokens: 2000,
      images: true,
    }),
    [model],
  );
  assert.deepEqual(
    eligible([model, small], {
      tokens: null,
      currentWindow: 200000,
      extraTokens: 0,
      images: false,
    }),
    [model],
  );
  assert.equal(
    eligible([model], {
      tokens: 190000,
      currentWindow: 200000,
      extraTokens: 0,
      images: false,
    }).length,
    0,
  );
});
test("routing asks directly among profiles, keep current, and new model", () => {
  const role = { ...defaults().roles[0], model };
  const question = routeQuestion([role]);
  assert.deepEqual(Object.keys(question.criteria), ["fast", KEEP, NEW]);
  assert.equal(
    (question.criteria.fast as { when_to_use: string }).when_to_use,
    role.criteria,
  );
});
test("routing tells Jev which profile categories require discovery", () => {
  const config = defaults();
  config.roles[0].model = model;
  config.roles.push({
    id: "translation",
    label: "Translation",
    criteria: "Translate public prose.",
  });
  const missing = missingProfiles(config);
  const question = routeQuestion([config.roles[0]], missing);
  const newModel = question.criteria[NEW] as {
    label: string;
    missing_profiles: Array<{ label: string }>;
  };
  assert.equal(newModel.label, "Pick a new model");
  assert.ok(
    newModel.missing_profiles.some(
      (profile) => profile.label === "Documentation",
    ),
  );
  assert.ok(
    newModel.missing_profiles.some(
      (profile) => profile.label === "Translation",
    ),
  );
  assert.ok(
    !newModel.missing_profiles.some((profile) => profile.label === "Fast"),
  );
});
test("discovery offers missing templates and supplied models only", () => {
  const config = defaults();
  config.roles[0].model = model;
  const result = discoveryQuestions(config, [model]);
  assert.ok(result.templates.some((role) => role.id === "documentation"));
  assert.ok(!result.templates.some((role) => role.id === "fast"));
  assert.deepEqual(Object.keys(result.questions.model.criteria), [
    "model_0",
    KEEP,
  ]);
});
test("response validation rejects unknown choices and invalid distributions", () => {
  const questions = { route: routeQuestion([]) };
  const valid = answer(questions);
  assert.equal(validateResult(valid, questions).answers.route.choice, KEEP);
  for (const change of [
    { choice: "unapproved" },
    { confidence: NaN },
    { confidence: 2 },
    { probabilities: { [KEEP]: 1 } },
    { probabilities: { [KEEP]: 0, [NEW]: 1 } },
  ]) {
    assert.throws(() =>
      validateResult(
        { ...valid, answers: { route: { ...valid.answers.route, ...change } } },
        questions,
      ),
    );
  }
});
test("the top choice remains valid at any reported confidence, including tied winners", () => {
  const questions = {
    route: routeQuestion([{ ...defaults().roles[1], model }]),
  };
  for (const confidence of [0, 0.52, 0.649, 0.65, 1]) {
    const response = {
      model: "jev-test",
      answers: {
        route: {
          type: "choice",
          choice: "coding",
          confidence,
          probabilities: { coding: 0.57, [KEEP]: 0.41, [NEW]: 0.02 },
        },
      },
    };
    const result = validateResult(response, questions);
    assert.equal(result.answers.route.choice, "coding");
    assert.equal(result.answers.route.confidence, confidence);
    response.answers.route.probabilities = {
      coding: 0.5,
      [KEEP]: 0.5,
      [NEW]: 0,
    };
    assert.equal(
      validateResult(response, questions).answers.route.choice,
      "coding",
    );
  }
});
test("HTTP client uses the fixed endpoint, refuses redirects, and validates answers", async () => {
  const questions = { route: routeQuestion([]) };
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "error");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer fake",
    );
    assert.equal(
      JSON.parse(String(init?.body)).state.request,
      "public example",
    );
    return Response.json(answer(questions));
  };
  const result = await askJev(
    defaults(),
    {
      request: "public example",
      current_model: "test/coder",
      has_images: false,
    },
    questions,
    "fake",
    new AbortController().signal,
    fetcher,
  );
  assert.equal(result.answers.route.choice, KEEP);
});
test("HTTP errors never echo response bodies or invalid JSON", async () => {
  const args = [
    defaults(),
    {
      request: "public example",
      current_model: "test/coder",
      has_images: false,
    },
    { route: routeQuestion([]) },
    "fake",
    new AbortController().signal,
  ] as const;
  await assert.rejects(
    askJev(
      ...args,
      async () => new Response("private detail", { status: 401 }),
    ),
    /^Error: Jev HTTP 401/,
  );
  await assert.rejects(
    askJev(...args, async () => new Response("private detail")),
    /^Error: Invalid Jev JSON/,
  );
  await assert.rejects(
    askJev(...args, async () => new Response("x".repeat(128001))),
    /size limit/,
  );
});
test("config saves atomically with private permissions and detects stale writers", () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-config-"));
  try {
    const path = join(dir, "config.json");
    const first = new ConfigStore(path);
    const second = new ConfigStore(path);
    const config = first.load();
    second.load();
    first.save(config);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), config);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.throws(() => second.save(config), /another session/);
    second.load();
    second.save(config);
    writeFileSync(path, "broken");
    assert.throws(() => first.load(), /Invalid router config/);
    assert.equal(readFileSync(path, "utf8"), "broken");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
