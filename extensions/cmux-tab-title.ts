/**
 * cmux Tab Title Extension
 *
 * Automatically sets the cmux tab title based on the conversation topic,
 * updating as the conversation evolves. Uses an LLM to generate a concise
 * 2-4 word description of what the conversation is about.
 *
 * Mirrors the behavior of wezterm-tab-title.ts but for cmux.
 * Only activates when running inside cmux (CMUX_WORKSPACE_ID is set).
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const CMUX_CLI = "/Applications/cmux.app/Contents/Resources/bin/cmux";
const STATE_PATH = join(homedir(), ".pi", "agent", "state", "cmux-tab-title.json");

const MIN_SUBSTANTIVE_LENGTH = 10;

// Titles produced by this extension look like "π repo: Topic" or "π: Topic".
const AUTO_TITLE_PATTERN = /^π(?:\s+[^:]+)?:\s+.+$/;

// pi's normal terminal title before this extension renames the cmux tab.
const PI_DEFAULT_TITLE_PATTERN = /^π(?:\s+-\s+.+|:\s*pi)?$/i;

const CONFIRMATION_PATTERNS =
	/^\s*(y(es|ep|eah)?|no(pe)?|ok(ay)?|sure|thanks?|thank you|do it|go ahead|lgtm|looks good|sounds good|perfect|great|nice|cool|got it|k|👍)\s*[.!?]*\s*$/i;

const TITLE_SYSTEM_PROMPT = `You generate ultra-short tab titles (2-4 words) that describe what a coding conversation is about. Output ONLY the title, nothing else. No quotes, no punctuation, no explanation.

Examples:
- User asks to fix a bug in auth → "Fix Auth Bug"
- User wants to add a new API endpoint → "Add API Endpoint"
- User is refactoring CSS styles → "Refactor CSS Styles"
- User asks about wezterm tab extension → "Wezterm Tab Extension"
- User wants to set up CI/CD → "Setup CI/CD"`;

function cmux(...args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(CMUX_CLI, args, { timeout: 5000 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

type CmuxIdentity = {
	socket_path?: string;
	caller?: { surface_ref?: string; tab_ref?: string };
	focused?: { surface_ref?: string; tab_ref?: string };
};

type TabTitleState = {
	tabs?: Record<string, { lastAutoTitle?: string; manualOverride?: boolean }>;
};

async function getCmuxIdentity(): Promise<CmuxIdentity | null> {
	try {
		return JSON.parse(await cmux("identify", "--json"));
	} catch {
		return null;
	}
}

function getSurfaceRef(identity: CmuxIdentity | null): string | undefined {
	return identity?.caller?.surface_ref || identity?.focused?.surface_ref;
}

function getTabStateKey(identity: CmuxIdentity | null): string | null {
	const ref = identity?.caller?.tab_ref || identity?.caller?.surface_ref || identity?.focused?.tab_ref || identity?.focused?.surface_ref;
	if (!ref) return null;
	return `${identity?.socket_path || "cmux"}:${ref}`;
}

async function readState(): Promise<TabTitleState> {
	try {
		return JSON.parse(await readFile(STATE_PATH, "utf8"));
	} catch {
		return { tabs: {} };
	}
}

async function writeState(state: TabTitleState): Promise<void> {
	await mkdir(dirname(STATE_PATH), { recursive: true });
	await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function getCurrentCmuxTabTitle(surfaceRef: string | undefined): Promise<string | null> {
	if (!surfaceRef) return null;

	try {
		const tree = JSON.parse(await cmux("tree", "--all", "--json"));
		const stack: unknown[] = [tree];

		while (stack.length > 0) {
			const item = stack.pop();
			if (!item || typeof item !== "object") continue;

			const record = item as Record<string, unknown>;
			if (record.ref === surfaceRef && typeof record.title === "string") {
				return record.title;
			}

			for (const value of Object.values(record)) {
				if (Array.isArray(value)) stack.push(...value);
				else if (value && typeof value === "object") stack.push(value);
			}
		}
	} catch {}

	return null;
}

function shouldTreatExistingTitleAsManual(title: string): boolean {
	if (!title.trim()) return false;
	if (AUTO_TITLE_PATTERN.test(title)) return false;
	if (PI_DEFAULT_TITLE_PATTERN.test(title)) return false;
	if (/^untitled$/i.test(title)) return false;
	return true;
}

async function renameCmuxTab(title: string, identity: CmuxIdentity | null): Promise<boolean> {
	const surfaceRef = getSurfaceRef(identity);

	if (surfaceRef) {
		try {
			await cmux("rename-tab", "--surface", surfaceRef, title);
			return true;
		} catch {
			// Fall through to the legacy behavior below.
		}
	}

	try {
		await cmux("rename-tab", title);
		return true;
	} catch {
		// Silently ignore — cmux may not be running or may not know this tab.
		return false;
	}
}

export default function (pi: ExtensionAPI) {
	const inCmux = !!process.env.CMUX_WORKSPACE_ID;
	if (!inCmux) return;

	let currentTitle: string | null = null;
	let repoName: string | null = null;

	async function getRepoName(): Promise<string | null> {
		try {
			const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 2000 });
			if (result.code === 0 && result.stdout) {
				return result.stdout.trim().split("/").pop() || null;
			}
		} catch {}
		return null;
	}

	function isSubstantive(text: string): boolean {
		if (text.length < MIN_SUBSTANTIVE_LENGTH) return false;
		if (CONFIRMATION_PATTERNS.test(text)) return false;
		return true;
	}

	function getConversationContext(ctx: ExtensionContext): string | null {
		const entries = ctx.sessionManager.getBranch();

		const messages: string[] = [];
		for (let i = entries.length - 1; i >= 0 && messages.length < 3; i--) {
			const entry = entries[i];
			if (entry.type !== "message" || entry.message.role !== "user") continue;

			const content = entry.message.content;
			let text: string | null = null;

			if (Array.isArray(content)) {
				const textPart = content.find((p: any) => p.type === "text");
				if (textPart) text = (textPart as any).text;
			} else if (typeof content === "string") {
				text = content;
			}

			if (text && isSubstantive(text)) messages.unshift(text);
		}

		if (messages.length === 0) return null;

		return messages.map((m) => m.substring(0, 200)).join("\n---\n");
	}

	function fallbackTitle(conversationContext: string): string | null {
		const firstLine = conversationContext
			.split("\n---\n")
			.at(-1)
			?.replace(/[`*_#>]/g, "")
			.replace(/\s+/g, " ")
			.trim();

		if (!firstLine) return null;

		const words = firstLine
			.replace(/[^\p{L}\p{N}\s/-]/gu, "")
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 4);

		if (words.length === 0) return null;

		return words
			.map((word) => {
				if (/^[A-Z0-9/-]+$/.test(word)) return word;
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join(" ")
			.substring(0, 40);
	}

	async function generateTitle(conversationContext: string, ctx: ExtensionContext): Promise<string | null> {
		const fallback = fallbackTitle(conversationContext);

		try {
			if (!ctx.model) return fallback;

			const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
			const userMessage: UserMessage = {
				role: "user",
				content: [{ type: "text", text: conversationContext }],
				timestamp: Date.now(),
			};

			const response = await complete(
				ctx.model,
				{ systemPrompt: TITLE_SYSTEM_PROMPT, messages: [userMessage] },
				{ apiKey, timeout: 10000 },
			);

			const title = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("")
				.trim()
				.split("\n")[0]
				.trim();

			if (!title) return fallback;
			if (/^pi$/i.test(title) || /^π$/i.test(title)) return fallback;
			if (title.length > 40) return title.substring(0, 39) + "…";

			return title;
		} catch {
			return fallback;
		}
	}

	pi.on("agent_end", async (_event, ctx) => {
		const conversationContext = getConversationContext(ctx);
		if (!conversationContext) return;

		const title = await generateTitle(conversationContext, ctx);
		if (!title) return;

		if (title === currentTitle) return;

		// Resolve repo name once
		if (repoName === null) {
			repoName = (await getRepoName()) || "";
		}

		const prefix = repoName ? `π ${repoName}` : "π";
		const fullTitle = `${prefix}: ${title}`;

		const identity = await getCmuxIdentity();
		const surfaceRef = getSurfaceRef(identity);
		const stateKey = getTabStateKey(identity);
		const state = await readState();
		const tabState = stateKey ? state.tabs?.[stateKey] : undefined;
		const existingTitle = await getCurrentCmuxTabTitle(surfaceRef);

		if (tabState?.manualOverride) return;

		if (existingTitle) {
			const lastAutoTitle = tabState?.lastAutoTitle;
			const manuallyRenamed = lastAutoTitle
				? existingTitle !== lastAutoTitle
				: shouldTreatExistingTitleAsManual(existingTitle);

			if (manuallyRenamed) {
				if (stateKey) {
					state.tabs ??= {};
					state.tabs[stateKey] = { ...tabState, manualOverride: true };
					await writeState(state);
				}
				return;
			}
		}

		// Set cmux tab title. Resolve the caller surface first because cmux env vars
		// can be stale when pi runs inside nested shells, causing untargeted rename-tab
		// calls to fail with "Tab not found".
		const renamed = await renameCmuxTab(fullTitle, identity);

		if (renamed && stateKey) {
			state.tabs ??= {};
			state.tabs[stateKey] = { lastAutoTitle: fullTitle };
			await writeState(state);
		}

		// Also set the pi TUI title and session name
		ctx.ui.setTitle(fullTitle);
		pi.setSessionName(title);
		currentTitle = title;
	});

	// Reset per-session in-memory caches. Persistent tab state still protects
	// manually-renamed cmux tabs across /reload and pi restarts.
	pi.on("session_start", async (_event, _ctx) => {
		currentTitle = null;
		repoName = null;
	});
}
