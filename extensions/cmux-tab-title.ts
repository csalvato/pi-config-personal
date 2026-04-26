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
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const CMUX_CLI = "/Applications/cmux.app/Contents/Resources/bin/cmux";

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

function cmux(...args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(CMUX_CLI, args, { timeout: 5000 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

async function renameCmuxTab(title: string): Promise<void> {
	try {
		const stdout = await cmux("identify", "--json");
		const identity = JSON.parse(stdout);
		const surfaceRef = identity?.caller?.surface_ref || identity?.focused?.surface_ref;

		if (surfaceRef) {
			await cmux("rename-tab", "--surface", surfaceRef, title);
			return;
		}
	} catch {
		// Fall through to the legacy behavior below.
	}

	try {
		await cmux("rename-tab", title);
	} catch {
		// Silently ignore — cmux may not be running or may not know this tab.
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

	async function generateTitle(conversationContext: string, ctx: ExtensionContext): Promise<string> {
		try {
			if (!ctx.model) return "pi";

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

			if (!title || title.length > 40) return title ? title.substring(0, 39) + "…" : "pi";

			return title;
		} catch {
			return "pi";
		}
	}

	pi.on("agent_end", async (_event, ctx) => {
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

		// Set cmux tab title. Resolve the caller surface first because cmux env vars
		// can be stale when pi runs inside nested shells, causing untargeted rename-tab
		// calls to fail with "Tab not found".
		await renameCmuxTab(fullTitle);

		// Also set the pi TUI title and session name
		ctx.ui.setTitle(fullTitle);
		pi.setSessionName(title);
		currentTitle = title;
	});

	// Reset on new session
	pi.on("session_switch", async (_event, _ctx) => {
		currentTitle = null;
		repoName = null;
	});
}
