import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { getPackageDir, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createRoleDisplay, createRoleFooter } from "../footer.ts";

function builtinTheme(name: "dark" | "light") {
  const json = JSON.parse(
    readFileSync(
      join(getPackageDir(), "dist/modes/interactive/theme", `${name}.json`),
      "utf8",
    ),
  );
  const colors = Object.fromEntries(
    Object.entries(json.colors).map(([key, value]) => {
      while (
        typeof value === "string" &&
        value !== "" &&
        !value.startsWith("#")
      ) {
        assert.ok(
          Object.hasOwn(json.vars, value),
          `unknown theme color ${value}`,
        );
        value = json.vars[value];
      }
      return [key, value];
    }),
  );
  return new Theme(
    colors as ConstructorParameters<typeof Theme>[0],
    colors as ConstructorParameters<typeof Theme>[1],
    "truecolor",
    { name },
  );
}

function fixture() {
  let role = "Planning";
  const entries: any[] = [];
  const statuses = new Map([
    ["jev-router", "Jev: auto"],
    ["other", "Other: ready"],
  ]);
  const ctx: any = {
    mode: "tui",
    hasUI: true,
    cwd: join(homedir(), "router-fixture"),
    model: {
      provider: "test",
      id: "model-a",
      reasoning: true,
      contextWindow: 272000,
    },
    thinkingLevel: "max",
    sessionManager: {
      getEntries: () => entries,
      getSessionName: () => "QA session",
    },
    getContextUsage: () => ({
      tokens: 54400,
      percent: 20,
      contextWindow: 272000,
    }),
    modelRegistry: { isUsingOAuth: () => false },
  };
  const data = {
    getGitBranch: () => "feature/test",
    getAvailableProviderCount: () => 2,
    getExtensionStatuses: () => statuses,
    onBranchChange: () => () => {},
  };
  return {
    ctx,
    data,
    entries,
    statuses,
    setRole: (value: string) => {
      role = value;
    },
    getRole: () => role,
  };
}

for (const name of ["dark", "light"] as const) {
  test(`${name} footer right-aligns the model, thinking, and applied role`, () => {
    const h = fixture();
    const theme = builtinTheme(name);
    const footer = createRoleFooter(h.ctx, theme, h.data, h.getRole);
    const lines = footer.render(120);
    assert.equal(
      stripVTControlCharacters(lines[0]),
      "~/router-fixture (feature/test) • QA session",
    );
    assert.match(
      stripVTControlCharacters(lines[1]),
      /20\.0%\/272k\s+\(test\) model-a • max • Jev: Planning$/,
    );
    assert.equal(visibleWidth(lines[1]), 120);
    assert.ok(lines[1].includes(theme.fg("accent", "Jev: Planning")));
    assert.equal(stripVTControlCharacters(lines[2]), "Jev: auto Other: ready");
    h.ctx.model.id = "model-b";
    h.ctx.thinkingLevel = "high";
    h.setRole("Coding implementation");
    footer.invalidate();
    assert.match(
      stripVTControlCharacters(footer.render(120)[1]),
      /model-b • high • Jev: Coding implementation$/,
    );
  });
}

test("the footer stays within every terminal width and sanitizes role labels", () => {
  const h = fixture();
  const footer = createRoleFooter(
    h.ctx,
    builtinTheme("dark"),
    h.data,
    h.getRole,
  );
  for (const label of [
    "Planning",
    "Data 分析 👩‍💻",
    "Long label ".repeat(8),
    "Review\n\t\x1b[2Jcode\x07",
  ]) {
    h.setRole(label);
    for (let width = 0; width <= 160; width++) {
      for (const line of footer.render(width)) {
        assert.ok(
          visibleWidth(line) <= width,
          `overflow at width ${width}: ${label}`,
        );
        assert.ok(!/[\n\r\t\x07]/.test(line));
        assert.ok(!line.includes("\x1b[2J"));
      }
    }
  }
  h.setRole("Planning");
  assert.ok(
    stripVTControlCharacters(footer.render(20)[1]).endsWith("Jev: Planning"),
  );
});

test("the footer keeps session usage, context, and other extension statuses", () => {
  const h = fixture();
  const usage = (
    input: number,
    output: number,
    cost: number,
    cacheRead = 0,
  ) => ({ input, output, cacheRead, cacheWrite: 0, cost: { total: cost } });
  h.entries.push(
    {
      type: "message",
      message: { role: "assistant", usage: usage(1000, 20, 0.2, 500) },
    },
    {
      type: "message",
      message: { role: "toolResult", usage: usage(100, 10, 0.1) },
    },
    { type: "compaction", usage: usage(200, 5, 0.2) },
    { type: "branch_summary", usage: usage(300, 15, 0.5) },
    {
      type: "custom",
      customType: "jev-router-decision",
      data: { usage: { input_tokens: 999999 } },
    },
  );
  const theme = builtinTheme("light");
  const footer = createRoleFooter(h.ctx, theme, h.data, h.getRole);
  const line = stripVTControlCharacters(footer.render(180)[1]);
  assert.match(line, /↑1\.6k ↓50 R500 CH33\.3% \$1\.000 20\.0%\/272k/);
  assert.ok(!line.includes("999999"));
  h.statuses.set("other", "Other: changed");
  assert.match(
    stripVTControlCharacters(footer.render(180)[2]),
    /Other: changed/,
  );
  h.ctx.getContextUsage = () => ({
    tokens: null,
    percent: null,
    contextWindow: 272000,
  });
  assert.match(stripVTControlCharacters(footer.render(180)[1]), /\?\/272k/);
  h.ctx.getContextUsage = () => ({
    tokens: 260000,
    percent: 95,
    contextWindow: 272000,
  });
  assert.ok(footer.render(180)[1].includes(theme.fg("error", "95.0%/272k")));
});

test("the footer omits thinking for non-reasoning models and shows subscription billing", () => {
  const h = fixture();
  h.ctx.model.reasoning = false;
  h.ctx.modelRegistry.isUsingOAuth = () => true;
  const footer = createRoleFooter(
    h.ctx,
    builtinTheme("dark"),
    h.data,
    h.getRole,
  );
  const line = stripVTControlCharacters(footer.render(120)[1]);
  assert.match(line, /\$0\.000 \(sub\)/);
  assert.match(line, /model-a • Jev: Planning$/);
  assert.ok(!line.includes("max"));
});

test("theme changes take effect on the next render", () => {
  const h = fixture();
  let active = builtinTheme("dark");
  const theme = {
    fg: (color: Parameters<Theme["fg"]>[0], value: string) =>
      active.fg(color, value),
  } as Theme;
  const footer = createRoleFooter(h.ctx, theme, h.data, h.getRole);
  const dark = footer.render(120)[1];
  active = builtinTheme("light");
  footer.invalidate();
  const light = footer.render(120)[1];
  assert.notEqual(dark, light);
  assert.equal(stripVTControlCharacters(dark), stripVTControlCharacters(light));
  assert.ok(light.includes(active.fg("accent", "Jev: Planning")));
});

test("the display hides stale labels and releases its branch listener", () => {
  const h = fixture();
  let footer: ReturnType<typeof createRoleFooter> & { dispose(): void };
  let onBranchChange: () => void;
  let renders = 0;
  let unsubscribes = 0;
  h.ctx.ui = {
    setFooter: (factory: Function | undefined) => {
      if (factory) {
        footer = factory(
          {
            requestRender: () => {
              renders++;
            },
          },
          builtinTheme("dark"),
          {
            ...h.data,
            onBranchChange: (callback: () => void) => {
              onBranchChange = callback;
              return () => {
                unsubscribes++;
              };
            },
          },
        );
      } else footer.dispose();
    },
  };
  const display = createRoleDisplay();
  display.show(h.ctx, h.ctx.model, "Planning");
  assert.match(
    stripVTControlCharacters(footer!.render(120)[1]),
    /Jev: Planning$/,
  );
  const before = renders;
  onBranchChange!();
  assert.equal(renders, before + 1);
  h.ctx.model = { ...h.ctx.model, id: "manual-choice" };
  const line = stripVTControlCharacters(footer!.render(120)[1]);
  assert.ok(!line.includes("Jev:"));
  assert.ok(line.includes("manual-choice"));
  display.clear(h.ctx);
  display.clear(h.ctx);
  assert.equal(unsubscribes, 1);
});

test("the role display uses no TUI methods in headless or RPC modes", () => {
  for (const mode of ["rpc", "print", "json"]) {
    const h = fixture();
    h.ctx.mode = mode;
    h.ctx.hasUI = mode === "rpc";
    h.ctx.ui = {
      setFooter: () => {
        throw new Error("TUI access");
      },
    };
    const display = createRoleDisplay();
    display.show(h.ctx, h.ctx.model, "Planning");
    display.clear(h.ctx);
  }
});
