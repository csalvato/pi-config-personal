/**
 * PR draft gate.
 *
 * Ensures new PRs are always opened as drafts unless the user explicitly asked
 * for a published PR. Without this, it is easy to fire `gh pr create` or
 * `gt submit` and open a ready-for-review PR by default.
 *
 * Behavior:
 * - `gh pr create` without `--draft`/`-d` is blocked.
 * - `gt submit` (and `gt s` / `gt ss` aliases) without `--draft`/`-d` is blocked.
 *   (`--draft` only affects NEW PRs in Graphite; updates to existing PRs are
 *   unaffected, so adding it is always safe.)
 *
 * Escape hatch: when the user explicitly requested a non-draft PR, prefix the
 * command with `PI_PUBLISH_PR=1` (e.g. `PI_PUBLISH_PR=1 gh pr create ...`).
 * Passing `--publish`/`-p` to `gt submit` also counts as explicit intent.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const OVERRIDE = "PI_PUBLISH_PR=1";

function hasDraftFlag(cmd: string): boolean {
  return /(^|\s)(--draft|-d)\b/.test(cmd);
}

function violatesDraftPolicy(cmd: string): string | null {
  if (cmd.includes(OVERRIDE)) return null;
  if (/(^|\s)--help\b/.test(cmd)) return null;

  if (/\bgh\s+pr\s+create\b/.test(cmd) && !hasDraftFlag(cmd)) {
    return "gh pr create must include --draft";
  }

  if (/\bgt\s+(submit|ss|s)\b/.test(cmd)) {
    const explicitPublish = /(^|\s)(--publish|-p)\b/.test(cmd);
    if (!hasDraftFlag(cmd) && !explicitPublish) {
      return "gt submit must include --draft (only affects newly created PRs)";
    }
  }

  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("bash", event)) return;

    const cmd = event.input.command ?? "";
    const violation = violatesDraftPolicy(cmd);
    if (violation) {
      return {
        block: true,
        reason:
          `PR draft gate: ${violation}. New PRs must be opened as drafts. ` +
          "Re-run the command with --draft. Only if the user explicitly asked for a " +
          `published (non-draft) PR, bypass with \`${OVERRIDE} <command>\` or use ` +
          "--publish with gt submit.",
      };
    }
  });
}
