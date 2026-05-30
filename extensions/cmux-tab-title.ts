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
import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CMUX_CLI = process.env.CMUX_BUNDLED_CLI_PATH || "/Applications/cmux.app/Contents/Resources/bin/cmux";

const MIN_SUBSTANTIVE_LENGTH = 15;

const CONFIRMATION_PATTERNS =
	/^\s*(y(es|ep|eah)?|no(pe)?|ok(ay)?|sure|thanks?|thank you|do it|go ahead|lgtm|looks good|sounds good|perfect|great|nice|cool|got it|k|👍)\s*[.!?]*\s*$/i;

const TITLE_SYSTEM_PROMPT = `You generate ultra-short tab titles (2-4 words) that describe what a coding conversation is about. Output ONLY the title, nothing else. No quotes, no punctuation, no explanation.

Examples:
- User asks to fix a bug in auth → "Fix Auth Bug"
- User wants to add a new API endpoint → "Add API Endpoint"
- User is refactoring CSS styles → "Refactor CSS Styles"
- User asks about wezterm tab extension → "Wezterm Tab Extension"
- User wants to set up CI/CD → "Setup CI/CD"`;

function cmux(...args: string[]): void {
	execFile(CMUX_CLI, args, (_err) => {
		// Silently ignore — cmux may not be running
	});
}

function cmuxOutput(...args: string[]): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(CMUX_CLI, args, { timeout: 3000 }, (err, stdout) => {
			if (err) return resolve(null);
			resolve(stdout);
		});
	});
}

function findSurfaceTitle(node: any, surfaceRef: string): string | null {
	if (!node || typeof node !== "object") return null;
	if (node.ref === surfaceRef && typeof node.title === "string") return node.title;
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				const title = findSurfaceTitle(item, surfaceRef);
				if (title !== null) return title;
			}
		} else if (value && typeof value === "object") {
			const title = findSurfaceTitle(value, surfaceRef);
			if (title !== null) return title;
		}
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	const inCmux = !!process.env.CMUX_WORKSPACE_ID;
	if (!inCmux) return;

	let currentTitle: string | null = null;
	let repoName: string | null = null;
	let lastAutoFullTitle: string | null = null;
	let manualOverride = false;

	async function getRepoName(): Promise<string | null> {
		try {
			const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 2000 });
			if (result.code === 0 && result.stdout) {
				return result.stdout.trim().split("/").pop() || null;
			}
		} catch {}
		return null;
	}

	async function getCallerTarget(): Promise<{ workspaceRef?: string; surfaceRef?: string }> {
		try {
			const output = await cmuxOutput("identify");
			if (!output) return {};
			const identify = JSON.parse(output);
			return {
				workspaceRef: identify?.caller?.workspace_ref,
				surfaceRef: identify?.caller?.surface_ref,
			};
		} catch {
			return {};
		}
	}

	async function getCurrentCmuxTitle(): Promise<string | null> {
		try {
			const { workspaceRef, surfaceRef } = await getCallerTarget();
			if (!workspaceRef || !surfaceRef) return null;
			const output = await cmuxOutput("tree", "--workspace", workspaceRef, "--json");
			if (!output) return null;
			return findSurfaceTitle(JSON.parse(output), surfaceRef);
		} catch {
			return null;
		}
	}

	function isDefaultOrAutoTitle(title: string | null): boolean {
		if (!title) return true;
		const trimmed = title.trim();
		if (!trimmed) return true;
		if (trimmed.startsWith("π")) return true;
		if (lastAutoFullTitle && trimmed === lastAutoFullTitle) return true;
		return /^(pi|zsh|bash|fish|node|npm|pnpm|yarn|npx|terminal)$/i.test(trimmed);
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

	function fallbackTitle(conversationContext: string): string {
		const latestMessage = conversationContext.split("\n---\n").pop() || conversationContext;
		const cleaned = latestMessage
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`[^`]*`/g, " ")
			.replace(/https?:\/\/\S+/g, " ")
			.replace(/[^a-zA-Z0-9+#.\s-]/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		const stopWords = new Set([
			"a",
			"an",
			"and",
			"are",
			"can",
			"could",
			"for",
			"from",
			"how",
			"into",
			"is",
			"it",
			"looks",
			"like",
			"me",
			"of",
			"on",
			"please",
			"that",
			"the",
			"this",
			"to",
			"we",
			"what",
			"when",
			"with",
			"you",
		]);

		const words = cleaned
			.split(" ")
			.filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase()))
			.slice(0, 4);

		if (words.length === 0) return "Pi";
		return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ").substring(0, 40);
	}

	async function generateTitle(conversationContext: string, ctx: ExtensionContext): Promise<string> {
		try {
			if (!ctx.model) return fallbackTitle(conversationContext);

			const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
			const userMessage: UserMessage = {
				role: "user",
				content: [{ type: "text", text: conversationContext }],
				timestamp: Date.now(),
			};

			const response = await complete(
				ctx.model,
				{ systemPrompt: TITLE_SYSTEM_PROMPT, messages: [userMessage] },
				{ apiKey, timeoutMs: 10000 },
			);

			if (response.stopReason === "error") return fallbackTitle(conversationContext);

			const title = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("")
				.trim()
				.split("\n")[0]
				.trim();

			if (!title || title.length > 40) return title ? title.substring(0, 39) + "…" : fallbackTitle(conversationContext);

			return title;
		} catch {
			return fallbackTitle(conversationContext);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		currentTitle = null;
		repoName = null;
		manualOverride = false;

		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== "cmux-tab-title") continue;
			const data = (entry as any).data;
			if (data && typeof data.fullTitle === "string") {
				lastAutoFullTitle = data.fullTitle;
			}
			if (data && typeof data.title === "string") {
				currentTitle = data.title;
			}
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (manualOverride) return;

		const cmuxTitle = await getCurrentCmuxTitle();
		if (!isDefaultOrAutoTitle(cmuxTitle)) {
			manualOverride = true;
			return;
		}

		const conversationContext = getConversationContext(ctx);
		if (!conversationContext) return;

		const title = await generateTitle(conversationContext, ctx);

		if (title === currentTitle) return;

		// Resolve repo name once
		if (repoName === null) {
			repoName = (await getRepoName()) || "";
		}

		const prefix = repoName ? `π ${repoName}` : "π";
		const fullTitle = `${prefix}: ${title}`;

		// Set cmux tab title. Pass explicit workspace/surface refs so background panes
		// and focus changes don't cause the rename to target the wrong tab.
		const target = await getCallerTarget();
		const args = ["rename-tab"];
		if (target.workspaceRef) args.push("--workspace", target.workspaceRef);
		if (target.surfaceRef) args.push("--surface", target.surfaceRef);
		args.push(fullTitle);
		cmux(...args);

		// Also set the pi TUI title and session name
		ctx.ui.setTitle(fullTitle);
		pi.setSessionName(title);
		currentTitle = title;
		lastAutoFullTitle = fullTitle;
		pi.appendEntry("cmux-tab-title", { title, fullTitle });
	});

	// Reset on new session
	pi.on("session_switch", async (_event, _ctx) => {
		currentTitle = null;
		repoName = null;
		lastAutoFullTitle = null;
		manualOverride = false;
	});
}
