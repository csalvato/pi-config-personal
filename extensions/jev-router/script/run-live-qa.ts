import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  askJev,
  missingProfiles,
  parseConfig,
  routeQuestion,
} from "../core.ts";
import { liveFixtures } from "../qa/live-fixtures.ts";

const runs = 3;
const confirmed = process.argv.includes("--confirm-live");
const configPath =
  process.env.JEV_ROUTER_CONFIG ??
  resolve(process.env.HOME ?? "", ".pi/agent/jev-router.json");
const groupIndex = process.argv.indexOf("--group");
const group = groupIndex >= 0 ? process.argv[groupIndex + 1] : undefined;
if (groupIndex >= 0 && !group)
  throw new Error("Pass a group name after --group.");
const outputIndex = process.argv.indexOf("--output");
const outputPath = resolve(
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "")
    : "qa/live-results.json",
);
if (outputIndex >= 0 && !process.argv[outputIndex + 1])
  throw new Error("Pass a path after --output.");
const fixtures = group
  ? liveFixtures.filter((fixture) => fixture.group === group)
  : liveFixtures;
if (!fixtures.length) throw new Error(`No live fixtures match group: ${group}`);

if (!existsSync(configPath))
  throw new Error(`Router config does not exist: ${configPath}`);
const config = parseConfig(JSON.parse(readFileSync(configPath, "utf8")));
const configured = config.roles.filter((role) => role.model);
if (!configured.length)
  throw new Error("Assign at least one router role before running live QA.");
if (!confirmed) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        fixtures: fixtures.length,
        calls: fixtures.length * runs,
        config: createHash("sha256")
          .update(readFileSync(configPath))
          .digest("hex"),
        output: outputPath,
        safety:
          "Pass --confirm-live to send synthetic public tasks to TypeSafe.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!process.env.TYPESAFE_API_KEY)
  throw new Error("Set TYPESAFE_API_KEY before the live QA run.");

const results: Array<{
  id: string;
  group: string;
  run: number;
  choice?: string;
  confidence?: number;
  latencyMs: number;
  correct?: boolean;
  error?: string;
}> = [];

for (const fixture of fixtures) {
  const roles = configured.filter(
    (role) => !fixture.omitRoles?.includes(role.id),
  );
  const missing = missingProfiles(config).filter(
    (role) => !roles.some((available) => available.id === role.id),
  );
  for (const role of configured.filter((role) =>
    fixture.omitRoles?.includes(role.id),
  )) {
    if (!missing.some((profile) => profile.id === role.id)) missing.push(role);
  }
  const questions = { route: routeQuestion(roles, missing) };
  for (let run = 1; run <= runs; run++) {
    const started = Date.now();
    try {
      const result = await askJev(
        config,
        {
          request: fixture.task,
          current_model: "qa/current-model",
          has_images: false,
        },
        questions,
        process.env.TYPESAFE_API_KEY,
        AbortSignal.timeout(config.timeoutMs),
      );
      const answer = result.answers.route;
      results.push({
        id: fixture.id,
        group: fixture.group,
        run,
        choice: answer.choice,
        confidence: answer.confidence,
        latencyMs: Date.now() - started,
        ...(fixture.expected.length
          ? { correct: fixture.expected.includes(answer.choice) }
          : {}),
      });
    } catch (error) {
      results.push({
        id: fixture.id,
        group: fixture.group,
        run,
        latencyMs: Date.now() - started,
        error:
          error instanceof Error
            ? error.message.replace(/Bearer\s+\S+/g, "Bearer [redacted]")
            : "unknown error",
      });
    }
  }
}

const clear = results.filter((result) => result.correct !== undefined);
const correct = clear.filter((result) => result.correct).length;
const sortedLatency = results
  .map((result) => result.latencyMs)
  .sort((a, b) => a - b);
const p95 =
  sortedLatency[Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)] ?? 0;
const byGroup = Object.fromEntries(
  [...new Set(results.map((result) => result.group))].sort().map((group) => {
    const groupResults = results.filter((result) => result.group === group);
    const scored = groupResults.filter(
      (result) => result.correct !== undefined,
    );
    return [
      group,
      {
        calls: groupResults.length,
        errors: groupResults.filter((result) => result.error).length,
        ...(scored.length
          ? {
              correct: scored.filter((result) => result.correct).length,
              total: scored.length,
            }
          : {}),
        choices: Object.fromEntries(
          [
            ...new Set(
              groupResults.map((result) => result.choice).filter(Boolean),
            ),
          ]
            .sort()
            .map((choice) => [
              choice,
              groupResults.filter((result) => result.choice === choice).length,
            ]),
        ),
      },
    ];
  }),
);
const report = {
  generatedAt: new Date().toISOString(),
  jevModel: config.jevModel,
  fixtureCount: fixtures.length,
  calls: results.length,
  summary: {
    clearCorrect: correct,
    clearTotal: clear.length,
    clearAccuracy: clear.length ? correct / clear.length : 0,
    errors: results.filter((result) => result.error).length,
    medianLatencyMs: sortedLatency[Math.floor(sortedLatency.length / 2)] ?? 0,
    p95LatencyMs: p95,
  },
  byGroup,
  // Task text is intentionally excluded. Fixture IDs are enough to reproduce a result.
  results,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${outputPath}`);
