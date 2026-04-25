/**
 * cmux Notification Extension
 *
 * Automatically notifies the user via cmux when the agent finishes responding.
 * Uses the agent_end hook so the notification is sent by the extension itself —
 * no visible bash command in the terminal.
 *
 * Only activates when running inside cmux (CMUX_WORKSPACE_ID is set).
 */

import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CMUX_CLI = "/Applications/cmux.app/Contents/Resources/bin/cmux";

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function cmux(...args: string[]): void {
	execFile(CMUX_CLI, args, (err) => {
		if (err) {
			// Silently ignore — cmux may not be running
		}
	});
}

export default function cmuxNotifyExtension(pi: ExtensionAPI) {
	const inCmux = !!process.env.CMUX_WORKSPACE_ID;
	if (!inCmux) return;

	pi.on("agent_start", async (_event) => {
		// Cancel any pending clear timer
		if (clearTimer) {
			clearTimeout(clearTimer);
			clearTimer = null;
		}
		cmux("set-status", "pi", "Working...", "--color", "#3b82f6");
	});

	pi.on("agent_end", async (_event) => {
		cmux("notify", "--title", "π Ready", "--body", "Waiting for input");
		cmux("set-status", "pi", "Done ✓", "--color", "#22c55e");

		// Clear the status pill after 30 seconds so it doesn't go stale
		clearTimer = setTimeout(() => {
			cmux("clear-status", "pi");
			clearTimer = null;
		}, 30_000);
	});
}
