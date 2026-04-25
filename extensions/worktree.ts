/**
 * Worktree Extension for Pi
 *
 * Automatically creates a git worktree (based off origin/main) before the
 * first mutating tool call in any session that is inside a git repo.
 * Uses process.chdir() to transparently redirect ALL subsequent tool calls
 * (bash, read, write, edit) into the new worktree — zero interruption to the
 * agent's flow.
 *
 * The only time the user is asked: when the derived branch name collides with
 * an existing branch/worktree.
 *
 * Commands:
 *   /worktree new [branch]  — manually create a worktree from origin/main
 *   /worktree list          — show all worktrees for this repo
 *   /worktree switch <path> — switch session CWD to an existing worktree
 *   /worktree done          — remove current worktree and return to main checkout
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Git helpers ──────────────────────────────────────────────────────────────

interface WorktreeInfo {
  path: string;
  branch: string | null;
  isPrimary: boolean;
}

function git(args: string[], cwd: string): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    ok: result.status === 0,
  };
}

/** Returns null if not in a git repo */
function getRepoRoot(cwd: string): string | null {
  const r = git(["rev-parse", "--show-toplevel"], cwd);
  return r.ok ? r.stdout : null;
}

/** Parse `git worktree list --porcelain` into structured entries */
function listWorktrees(repoRoot: string): WorktreeInfo[] {
  const r = git(["worktree", "list", "--porcelain"], repoRoot);
  if (!r.ok) return [];

  const entries: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) entries.push(current as WorktreeInfo);
      current = { path: line.slice(9), branch: null, isPrimary: entries.length === 0 };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "") {
      if (current.path) {
        entries.push(current as WorktreeInfo);
        current = {};
      }
    }
  }
  if (current.path) entries.push(current as WorktreeInfo);

  return entries;
}

/** Current branch in the given directory */
function currentBranch(cwd: string): string | null {
  const r = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return r.ok ? r.stdout : null;
}

/** Whether a branch name already exists locally */
function branchExists(repoRoot: string, branch: string): boolean {
  return git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot).ok;
}

/** Whether a worktree already exists at the given path */
function worktreeExistsAt(repoRoot: string, wtPath: string): boolean {
  return listWorktrees(repoRoot).some((w) => w.path === wtPath);
}

/** Canonical main branch name for this remote */
function remoteMainBranch(repoRoot: string): string {
  const r = git(["symbolic-ref", "refs/remotes/origin/HEAD"], repoRoot);
  if (r.ok) return r.stdout.replace("refs/remotes/origin/", "");
  // Fallback: check common names
  for (const name of ["main", "master", "trunk", "develop"]) {
    if (git(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${name}`], repoRoot).ok) {
      return name;
    }
  }
  return "main";
}

// ─── Branch name derivation ───────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "be", "as", "do", "use",
  "can", "will", "also", "just", "that", "this", "we", "i", "you",
  "please", "should", "would", "could", "all", "any", "some",
]);

/** Derive a kebab-case branch name from a free-text prompt */
function deriveBranchName(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")   // drop punctuation
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .slice(0, 6)
    .join("-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "");

  return `pi/${slug || "task"}`;
}

/** Make a branch name unique by appending -2, -3, etc. */
function uniqueBranchName(repoRoot: string, base: string): string {
  if (!branchExists(repoRoot, base)) return base;
  let n = 2;
  while (branchExists(repoRoot, `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ─── Worktree creation ────────────────────────────────────────────────────────

interface CreatedWorktree {
  worktreePath: string;
  branch: string;
}

async function createWorktree(
  repoRoot: string,
  branch: string,
  mainBranch: string,
): Promise<CreatedWorktree> {
  const repoName = path.basename(repoRoot);
  const branchSlug = branch.replace(/\//g, "--");
  const worktreePath = path.join(path.dirname(repoRoot), `${repoName}--${branchSlug}`);

  // Fetch latest origin/main
  git(["fetch", "origin", mainBranch, "--quiet"], repoRoot);

  // Create worktree from origin/main
  const result = git(
    ["worktree", "add", worktreePath, "-b", branch, `origin/${mainBranch}`],
    repoRoot,
  );

  if (!result.ok) {
    throw new Error(`git worktree add failed: ${result.stderr}`);
  }

  return { worktreePath, branch };
}

// ─── Extension state ──────────────────────────────────────────────────────────

interface State {
  /** True after we've created (or detected) a worktree for this session */
  worktreeReady: boolean;
  /** The active worktree path (may differ from process.cwd() before chdir) */
  worktreePath: string | null;
  /** The active branch name */
  branch: string | null;
  /** Root of the repo we started in */
  repoRoot: string | null;
}

const MUTATING_TOOLS = new Set(["write", "edit"]);

function isMutatingBash(command: string): boolean {
  // Heuristic: treat bash as mutating unless it's clearly read-only
  const readOnlyPrefixes = [
    "ls", "cat", "echo", "grep", "find", "rg", "wc", "head", "tail",
    "git log", "git status", "git diff", "git show", "git branch",
    "git worktree list", "git rev-parse", "bundle exec rubocop",
    "spring rubocop", "spring rspec", "bundle exec rspec",
    "cd ", "pwd", "which", "ruby", "rbenv",
  ];
  const cmd = command.trim();
  return !readOnlyPrefixes.some((p) => cmd.startsWith(p));
}

// ─── Main extension ───────────────────────────────────────────────────────────

export default function worktreeExtension(pi: ExtensionAPI) {
  const state: State = {
    worktreeReady: false,
    worktreePath: null,
    branch: null,
    repoRoot: null,
  };

  function updateWidget(ctx: ExtensionContext) {
    if (state.branch) {
      ctx.ui.setWidget("worktree", [`🌿 ${state.branch}`]);
    } else {
      ctx.ui.setWidget("worktree", []);
    }
  }

  /** Core logic: ensure we're in a worktree before allowing a mutating tool */
  async function ensureWorktree(ctx: ExtensionContext): Promise<void> {
    if (state.worktreeReady) return;
    state.worktreeReady = true; // set eagerly to prevent re-entrant calls

    const cwd = process.cwd();
    const repoRoot = getRepoRoot(cwd);
    if (!repoRoot) return; // not a git repo — nothing to do

    state.repoRoot = repoRoot;

    // Find the deepest (most-specific) matching worktree for the current cwd.
    // This matters when a worktree is nested inside the primary directory
    // (e.g. capital-main/capital-cuw-382 is inside capital-main/).
    const worktrees = listWorktrees(repoRoot);
    const currentWt = worktrees
      .filter((w) => cwd === w.path || cwd.startsWith(w.path + path.sep))
      .sort((a, b) => b.path.length - a.path.length)[0]; // longest match wins

    const isPrimary = currentWt?.isPrimary ?? true;
    const branch = currentWt?.branch ?? currentBranch(cwd);
    const mainBranch = remoteMainBranch(repoRoot);

    if (!isPrimary) {
      // Already in a dedicated worktree — just record state and show widget
      state.worktreePath = cwd;
      state.branch = branch;
      updateWidget(ctx);
      return;
    }

    if (branch && branch !== mainBranch) {
      // Primary worktree but already on a feature branch — pre-existing work,
      // leave it alone. Show the branch in the widget so the user is aware.
      state.worktreeReady = true; // don't auto-trigger
      state.worktreePath = cwd;
      state.branch = branch;
      updateWidget(ctx);
      return;
    }

    // We're in the primary worktree on main (or a branch) — auto-create a new worktree

    // Derive branch name from first user message in this session
    const entries = ctx.sessionManager.getBranch();
    const firstUserText = entries
      .filter((e) => e.type === "message" && (e as any).message?.role === "user")
      .map((e) => {
        const content = (e as any).message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join(" ");
        }
        return "";
      })
      .find((t) => t.trim());

    const baseBranch = deriveBranchName(firstUserText ?? "task");

    // Check for collision — only ask the user if there's one
    let finalBranch: string;
    if (branchExists(repoRoot, baseBranch)) {
      const suggested = uniqueBranchName(repoRoot, baseBranch);
      const input = await ctx.ui.input(
        "Branch name collision",
        `"${baseBranch}" already exists. Enter a different name:`,
        suggested,
      );
      if (!input) {
        state.worktreeReady = false; // allow retry
        return;
      }
      finalBranch = input;
    } else {
      finalBranch = baseBranch;
    }

    try {
      ctx.ui.notify(`Creating worktree: ${finalBranch}`, "info");
      const { worktreePath, branch: createdBranch } = await createWorktree(
        repoRoot,
        finalBranch,
        mainBranch,
      );

      // Redirect the entire pi process into the new worktree
      process.chdir(worktreePath);

      state.worktreePath = worktreePath;
      state.branch = createdBranch;
      updateWidget(ctx);
      ctx.ui.notify(`✓ Switched to worktree: ${worktreePath}`, "success");
    } catch (err: any) {
      state.worktreeReady = false; // allow retry
      ctx.ui.notify(`Worktree creation failed: ${err.message}`, "error");
    }
  }

  // ── Intercept the first mutating tool call ────────────────────────────────

  pi.on("tool_call", async (event, ctx) => {
    if (state.worktreeReady) return; // already handled

    let isMutating = false;

    if (MUTATING_TOOLS.has(event.toolName)) {
      isMutating = true;
    } else if (isToolCallEventType("bash", event)) {
      isMutating = isMutatingBash(event.input.command);
    }

    if (isMutating) {
      await ensureWorktree(ctx);
    }
  });

  // ── Detect existing worktree on session start ────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const cwd = process.cwd();
    const repoRoot = getRepoRoot(cwd);
    if (!repoRoot) return;

    state.repoRoot = repoRoot;

    const worktrees = listWorktrees(repoRoot);
    const currentWt = worktrees
      .filter((w) => cwd === w.path || cwd.startsWith(w.path + path.sep))
      .sort((a, b) => b.path.length - a.path.length)[0];

    if (currentWt && !currentWt.isPrimary && currentWt.branch) {
      // Started pi directly inside a non-primary worktree — mark as ready
      state.worktreeReady = true;
      state.worktreePath = currentWt.path;
      state.branch = currentWt.branch;
      updateWidget(ctx);
    }
  });

  // ── Commands ──────────────────────────────────────────────────────────────

  pi.registerCommand("worktree", {
    description: "Manage git worktrees: new [branch] | list | switch <path> | done",
    handler: async (args, ctx) => {
      const [sub, ...rest] = (args ?? "").trim().split(/\s+/);
      const cwd = process.cwd();
      const repoRoot = getRepoRoot(cwd) ?? state.repoRoot;

      if (!repoRoot) {
        ctx.ui.notify("Not in a git repo", "error");
        return;
      }

      // ── /worktree new [branch] ───────────────────────────────────────────
      if (!sub || sub === "new") {
        const mainBranch = remoteMainBranch(repoRoot);
        let branch = rest.join("-") || "";

        if (!branch) {
          const input = await ctx.ui.input(
            "New worktree",
            "Branch name (leave blank to derive from session):",
            "",
          );
          if (input === undefined) { ctx.ui.notify("Cancelled", "info"); return; }
          branch = input;
        }

        if (!branch) {
          const entries = ctx.sessionManager.getBranch();
          const firstUserText = entries
            .filter((e) => e.type === "message" && (e as any).message?.role === "user")
            .map((e) => {
              const content = (e as any).message?.content;
              if (typeof content === "string") return content;
              if (Array.isArray(content)) {
                return content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
              }
              return "";
            })
            .find((t) => t.trim());
          branch = deriveBranchName(firstUserText ?? "task");
        }

        branch = uniqueBranchName(repoRoot, branch);

        try {
          ctx.ui.notify(`Creating worktree: ${branch}`, "info");
          const { worktreePath, branch: createdBranch } = await createWorktree(
            repoRoot, branch, mainBranch,
          );
          process.chdir(worktreePath);
          state.worktreeReady = true;
          state.worktreePath = worktreePath;
          state.branch = createdBranch;
          updateWidget(ctx);
          ctx.ui.notify(`✓ ${worktreePath}`, "success");
        } catch (err: any) {
          ctx.ui.notify(`Failed: ${err.message}`, "error");
        }
        return;
      }

      // ── /worktree list ───────────────────────────────────────────────────
      if (sub === "list") {
        const worktrees = listWorktrees(repoRoot);
        const lines = worktrees.map((w) => {
          const active = w.path === (state.worktreePath ?? cwd) ? " ◀ active" : "";
          const primary = w.isPrimary ? " (primary)" : "";
          return `${w.branch ?? "(detached)"}${primary}${active}\n  ${w.path}`;
        });
        ctx.ui.notify(lines.join("\n\n") || "No worktrees found", "info");
        return;
      }

      // ── /worktree switch <path-or-branch> ────────────────────────────────
      if (sub === "switch") {
        const target = rest.join(" ");
        if (!target) { ctx.ui.notify("Usage: /worktree switch <path or branch>", "error"); return; }

        const worktrees = listWorktrees(repoRoot);
        const wt = worktrees.find(
          (w) => w.path === target || w.branch === target ||
            path.basename(w.path) === target,
        );

        const targetPath = wt?.path ?? target;
        if (!fs.existsSync(targetPath)) {
          ctx.ui.notify(`Path not found: ${targetPath}`, "error");
          return;
        }

        process.chdir(targetPath);
        state.worktreeReady = true;
        state.worktreePath = targetPath;
        state.branch = wt?.branch ?? currentBranch(targetPath);
        updateWidget(ctx);
        ctx.ui.notify(`✓ Switched to ${targetPath}`, "success");
        return;
      }

      // ── /worktree done ───────────────────────────────────────────────────
      if (sub === "done") {
        if (!state.worktreePath) {
          ctx.ui.notify("No active worktree to remove", "error");
          return;
        }

        const ok = await ctx.ui.confirm(
          "Remove worktree?",
          `Remove ${state.worktreePath} and switch back to main checkout?`,
        );
        if (!ok) { ctx.ui.notify("Cancelled", "info"); return; }

        const mainWt = listWorktrees(repoRoot).find((w) => w.isPrimary);
        const returnPath = mainWt?.path ?? repoRoot;

        process.chdir(returnPath);
        git(["worktree", "remove", state.worktreePath], repoRoot);

        state.worktreeReady = false;
        state.worktreePath = null;
        state.branch = null;
        ctx.ui.setWidget("worktree", []);
        ctx.ui.notify(`✓ Returned to ${returnPath}`, "success");
        return;
      }

      ctx.ui.notify("Usage: /worktree new [branch] | list | switch <path> | done", "info");
    },
  });
}
