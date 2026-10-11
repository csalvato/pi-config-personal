import { homedir } from "node:os";
import { sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { sameModel, type ModelRef } from "./core.ts";

function singleLine(value: string): string {
  return stripVTControlCharacters(value)
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/ +/g, " ")
    .trim();
}

function tokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function stats(ctx: ExtensionContext, theme: Theme) {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let cacheHit: number | undefined;
  for (const entry of ctx.sessionManager.getEntries()) {
    const usage =
      entry.type === "message" &&
      (entry.message.role === "assistant" ||
        entry.message.role === "toolResult")
        ? entry.message.usage
        : entry.type === "compaction" || entry.type === "branch_summary"
          ? entry.usage
          : undefined;
    if (!usage) continue;
    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
    total.cost += usage.cost.total;
    if (entry.type === "message" && entry.message.role === "assistant") {
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
      cacheHit = prompt ? (usage.cacheRead / prompt) * 100 : undefined;
    }
  }
  const parts: string[] = [];
  for (const [key, prefix] of [
    ["input", "↑"],
    ["output", "↓"],
    ["cacheRead", "R"],
    ["cacheWrite", "W"],
  ] as const) {
    if (total[key]) parts.push(`${prefix}${tokens(total[key])}`);
  }
  if ((total.cacheRead || total.cacheWrite) && cacheHit !== undefined) {
    parts.push(`CH${cacheHit.toFixed(1)}%`);
  }
  const subscription =
    ctx.model &&
    (ctx.model.provider === "kimi-coding" ||
      ctx.modelRegistry.isUsingOAuth(ctx.model));
  if (total.cost || subscription)
    parts.push(`$${total.cost.toFixed(3)}${subscription ? " (sub)" : ""}`);
  const usage = ctx.getContextUsage();
  const percent = usage?.percent;
  const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const context = theme.fg(
    percent != null && percent > 90
      ? "error"
      : percent != null && percent > 70
        ? "warning"
        : "dim",
    `${percent == null ? "?" : `${percent.toFixed(1)}%`}/${tokens(window)}`,
  );
  return {
    context,
    full: [theme.fg("dim", parts.join(" ")), context].filter(Boolean).join(" "),
  };
}

export function createRoleFooter(
  ctx: ExtensionContext,
  theme: Theme,
  data: ReadonlyFooterDataProvider,
  getRole: () => string | undefined,
) {
  return {
    invalidate() {},
    render(width: number): string[] {
      if (width < 1) return [""];
      const home = homedir();
      let cwd =
        ctx.cwd === home
          ? "~"
          : ctx.cwd.startsWith(`${home}${sep}`)
            ? `~${ctx.cwd.slice(home.length)}`
            : ctx.cwd;
      const branch = data.getGitBranch();
      if (branch) cwd += ` (${branch})`;
      const name = ctx.sessionManager.getSessionName();
      if (name) cwd += ` • ${name}`;
      const model = singleLine(ctx.model?.id ?? "no-model");
      const thinking = ctx.model?.reasoning
        ? ` • ${ctx.thinkingLevel === "off" ? "thinking off" : ctx.thinkingLevel}`
        : "";
      const label = getRole();
      const role = label ? theme.fg("accent", `Jev: ${singleLine(label)}`) : "";
      const provider =
        ctx.model && data.getAvailableProviderCount() > 1
          ? `(${singleLine(ctx.model.provider)}) `
          : "";
      const right = (detail: string) =>
        [theme.fg("dim", detail), role].filter(Boolean).join(" • ");
      const variants = [
        right(`${provider}${model}${thinking}`),
        right(`${model}${thinking}`),
        right(model),
        role || model,
      ];
      const left = stats(ctx, theme);
      // Keep the role visible on narrow terminals before adding usage details.
      const selected =
        variants.find(
          (value) =>
            visibleWidth(value) + visibleWidth(left.context) + 2 <= width,
        ) ??
        variants.find((value) => visibleWidth(value) <= width) ??
        truncateToWidth(role || model, width, "…");
      const room = width - visibleWidth(selected) - 2;
      const summary =
        visibleWidth(left.full) <= room
          ? left.full
          : visibleWidth(left.context) <= room
            ? left.context
            : "";
      const line =
        summary +
        " ".repeat(
          Math.max(0, width - visibleWidth(summary) - visibleWidth(selected)),
        ) +
        selected;
      const lines = [
        truncateToWidth(theme.fg("dim", singleLine(cwd)), width),
        line,
      ];
      const statuses = [...data.getExtensionStatuses()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, text]) => text.replace(/[\r\n\t]/g, " "));
      if (statuses.length)
        lines.push(truncateToWidth(statuses.join(" "), width));
      return lines;
    },
  };
}

export function createRoleDisplay() {
  let selection: { model: ModelRef; label: string } | undefined;
  let ownedFooter: object | undefined;
  let requestRender: (() => void) | undefined;
  return {
    show(ctx: ExtensionContext, model: ModelRef, label: string) {
      if (!ctx.hasUI || ctx.mode !== "tui") return;
      selection = { model: { provider: model.provider, id: model.id }, label };
      if (!ownedFooter) {
        ctx.ui.setFooter((tui, theme, data) => {
          const owner = {};
          ownedFooter = owner;
          requestRender = () => tui.requestRender();
          const unsubscribe = data.onBranchChange(() => tui.requestRender());
          const footer = createRoleFooter(ctx, theme, data, () =>
            sameModel(selection?.model, ctx.model)
              ? selection?.label
              : undefined,
          );
          return {
            ...footer,
            dispose() {
              unsubscribe();
              if (ownedFooter === owner) {
                ownedFooter = undefined;
                requestRender = undefined;
              }
            },
          };
        });
      }
      requestRender?.();
    },
    clear(ctx: ExtensionContext) {
      selection = undefined;
      if (ownedFooter && ctx.mode === "tui") ctx.ui.setFooter(undefined);
    },
  };
}
