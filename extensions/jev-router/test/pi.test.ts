import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { pick } from "../picker.ts";

test("installed pi loads the real extension and registers the router command", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "jev-pi-load-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const loader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    settingsManager: SettingsManager.inMemory({ packages: [] }),
    additionalExtensionPaths: [resolve("index.ts")],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const result = loader.getExtensions();
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  assert.ok(result.extensions[0].commands.has("router"));
  assert.ok(result.extensions[0].handlers.has("before_agent_start"));
});

test("real picker filters by label and provider, selects, and cancels", async () => {
  const items = [
    { value: "one", label: "alpha/model-one", description: "Fast model" },
    {
      value: "two",
      label: "beta/model-two",
      description: "Documentation model",
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      value: `extra-${i}`,
      label: `Extra ${i}`,
    })),
  ];
  async function exercise(keys: string[]) {
    const ctx: any = {
      mode: "tui",
      ui: {
        custom: async (factory: Function) => {
          let selected: string | undefined;
          const component = factory(
            { requestRender() {} },
            { fg: (_color: string, text: string) => text },
            getKeybindings(),
            (value: string | undefined) => {
              selected = value;
            },
          );
          component.focused = true;
          for (const key of keys) component.handleInput(key);
          for (const width of [40, 80, 120]) {
            for (const line of component.render(width))
              assert.ok(
                visibleWidth(line) <= width,
                `line exceeds width ${width}`,
              );
          }
          component.invalidate();
          return selected;
        },
      },
    };
    return pick(ctx, "Choose a model", items);
  }
  assert.equal(await exercise(["d", "o", "c", "\r"]), "two");
  assert.equal(await exercise(["b", "e", "t", "a", "\r"]), "two");
  assert.equal(await exercise(["z", "z", "\r", "\x1b"]), undefined);
  assert.equal(await exercise(["\x03"]), undefined);
});
