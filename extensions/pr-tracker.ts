/**
 * PR Tracker Extension
 *
 * Automatically captures GitHub PR URLs from bash tool output during the
 * session and makes them available via /prs.
 *
 * Usage:
 *   /prs          — list all PRs opened in this session
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

interface PR {
	number: number;
	url: string;
	repo: string;
	title?: string;
}

interface PRTrackerEntry {
	prs: PR[];
}

const PR_URL_REGEX = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;

function extractPRs(text: string): PR[] {
	const found: PR[] = [];
	const seen = new Set<number>();
	let match: RegExpExecArray | null;

	PR_URL_REGEX.lastIndex = 0;
	while ((match = PR_URL_REGEX.exec(text)) !== null) {
		const repo = match[1];
		const number = parseInt(match[2], 10);
		const url = match[0];
		if (!seen.has(number)) {
			seen.add(number);
			found.push({ number, url, repo });
		}
	}

	return found;
}

export default function (pi: ExtensionAPI) {
	// In-memory list of PRs for this session
	let prs: PR[] = [];

	const mergeNewPRs = (incoming: PR[]) => {
		for (const pr of incoming) {
			if (!prs.some((p) => p.number === pr.number && p.repo === pr.repo)) {
				prs.push(pr);
			}
		}
	};

	/** Restore PR list from persisted session entries */
	const restoreFromSession = (ctx: ExtensionContext) => {
		prs = [];
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === "pr-tracker") {
				const data = entry.data as PRTrackerEntry | undefined;
				if (data?.prs) {
					// Each entry is additive — latest state wins per PR number
					mergeNewPRs(data.prs);
				}
			}
		}
	};

	pi.on("session_start", async (_event, ctx) => restoreFromSession(ctx));
	pi.on("session_switch", async (_event, ctx) => restoreFromSession(ctx));
	pi.on("session_fork", async (_event, ctx) => restoreFromSession(ctx));
	pi.on("session_tree", async (_event, ctx) => restoreFromSession(ctx));

	/** Watch bash tool results for PR URLs */
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName !== "bash") return;

		// Concatenate all text content from the result
		const text = event.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		const found = extractPRs(text);
		if (found.length === 0) return;

		mergeNewPRs(found);

		// Try to find a PR title: look for the line before the URL that looks like plain prose
		// (no "remote:" prefix, no colons, not another URL, not too long)
		for (const pr of found) {
			if (!pr.title) {
				const lines = text.split("\n");
				const urlLineIdx = lines.findIndex((l) => l.includes(pr.url));
				if (urlLineIdx > 0) {
					const candidate = lines[urlLineIdx - 1].trim();
					const looksLikeTitle =
						candidate.length > 0 &&
						candidate.length < 120 &&
						!candidate.startsWith("http") &&
						!candidate.includes("remote:") &&
						!candidate.includes("://") &&
						!/^\s*[A-Z][\w]+:/.test(candidate); // skip "Warning:", "Error:", etc.
					if (looksLikeTitle) {
						pr.title = candidate;
					}
				}
			}
		}

		// Persist to session
		pi.appendEntry("pr-tracker", { prs: [...prs] } satisfies PRTrackerEntry);
	});

	/** /prs command — display all PRs opened in this session */
	pi.registerCommand("prs", {
		description: "List all PRs opened in this session",
		handler: async (_args, ctx) => {
			if (prs.length === 0) {
				ctx.ui.notify("No PRs opened in this session yet.", "info");
				return;
			}

			const lines = prs.map((pr) => {
				const label = pr.title ? `#${pr.number} — ${pr.title}` : `#${pr.number}`;
				return `${label}\n  ${pr.url}`;
			});

			const summary = `${prs.length} PR${prs.length === 1 ? "" : "s"} opened this session:\n\n${lines.join("\n\n")}`;
			ctx.ui.notify(summary, "info");
		},
	});
}
