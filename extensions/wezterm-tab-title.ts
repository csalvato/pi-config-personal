/**
 * WezTerm Tab Title Extension
 *
 * Automatically sets the terminal tab title based on the conversation topic,
 * updating as the conversation evolves. Uses an LLM to generate a concise
 * 2-4 word description of what the conversation is about.
 *
 * Only updates if the user hasn't manually set a WezTerm tab title
 * (via right-click → "Set Tab Title" or `wezterm cli set-tab-title`).
 *
 * Detection: WezTerm's `tab_title` field is "" when using the default,
 * and non-empty when the user explicitly sets it.
 */

import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const MIN_SUBSTANTIVE_LENGTH = 15;

const CONFIRMATION_PATTERNS = /^\s*(y(es|ep|eah)?|no(pe)?|ok(ay)?|sure|thanks?|thank you|do it|go ahead|lgtm|looks good|sounds good|perfect|great|nice|cool|got it|k|👍)\s*[.!?]*\s*$/i;

const TITLE_SYSTEM_PROMPT = `You generate ultra-short tab titles (2-4 words) that describe what a coding conversation is about. Output ONLY the title, nothing else. No quotes, no punctuation, no explanation.

Examples:
- User asks to fix a bug in auth → "Fix Auth Bug"
- User wants to add a new API endpoint → "Add API Endpoint"
- User is refactoring CSS styles → "Refactor CSS Styles"
- User asks about wezterm tab extension → "Wezterm Tab Extension"
- User wants to set up CI/CD → "Setup CI/CD"`;

export default function (pi: ExtensionAPI) {
	const paneId = process.env.WEZTERM_PANE;

	// Only activate in WezTerm
	if (!paneId) return;

	let currentTitle: string | null = null;
	let repoName: string | null = null;

	async function getRepoName(cwd: string): Promise<string | null> {
		try {
			const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 2000 });
			if (result.code === 0 && result.stdout) {
				return result.stdout.trim().split("/").pop() || null;
			}
		} catch {}
		return null;
	}

	async function hasUserSetTabTitle(): Promise<boolean> {
		try {
			const result = await pi.exec("wezterm", ["cli", "list", "--format", "json"], { timeout: 3000 });
			if (result.code !== 0 || !result.stdout) return false;

			const panes = JSON.parse(result.stdout);
			const currentPane = panes.find((p: any) => String(p.pane_id) === paneId);
			if (!currentPane) return false;

			return currentPane.tab_title !== "";
		} catch {
			return false;
		}
	}

	function isSubstantive(text: string): boolean {
		if (text.length < MIN_SUBSTANTIVE_LENGTH) return false;
		if (CONFIRMATION_PATTERNS.test(text)) return false;
		return true;
	}

	function getConversationContext(ctx: ExtensionContext): string | null {
		const entries = ctx.sessionManager.getBranch();

		// Collect the last few substantive user messages for context
		const messages: string[] = [];
		for (let i = entries.length - 1; i >= 0 && messages.length < 3; i--) {
			const entry = entries[i];
			if (entry.type !== "message" || entry.message.role !== "user") continue;

			const content = entry.message.content;
			let text: string | null = null;

			if (Array.isArray(content)) {
				const textPart = content.find((p: any) => p.type === "text");
				if (textPart) text = textPart.text;
			} else if (typeof content === "string") {
				text = content;
			}

			if (text && isSubstantive(text)) messages.unshift(text);
		}

		if (messages.length === 0) return null;

		// Truncate each message to keep the LLM call cheap
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

			// Sanity check: if the LLM returned something too long or empty, fall back
			if (!title || title.length > 40) return title ? title.substring(0, 39) + "…" : "pi";

			return title;
		} catch {
			return "pi";
		}
	}

	pi.on("agent_end", async (_event, ctx) => {
		const conversationContext = getConversationContext(ctx);
		if (!conversationContext) return;

		// Check if user manually set a tab title in WezTerm
		if (await hasUserSetTabTitle()) return;

		// Generate a title using the LLM
		const title = await generateTitle(conversationContext, ctx);

		// Skip if title hasn't changed
		if (title === currentTitle) return;

		// Resolve repo name once
		if (repoName === null) {
			repoName = (await getRepoName(ctx.cwd)) || "";
		}

		const prefix = repoName ? `π ${repoName}` : "π";
		const fullTitle = `${prefix}: ${title}`;
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
