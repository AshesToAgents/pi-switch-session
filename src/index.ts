/**
 * Switch Session
 *
 * Gives the agent a tool to replace the active session with a new one in a
 * different working directory, optionally with an initial prompt.
 *
 * Mechanics: session replacement is only safe from a command context (calling
 * it from tool/lifecycle contexts can deadlock the runtime). The tool therefore
 * queues `/switch-session <dir>` as a follow-up user message — dispatched after
 * the current run ends — and stashes the full request (including multiline
 * prompts) in module state. The command handler creates a fresh session file
 * with the target directory as its cwd and switches to it; the runtime then
 * recreates all cwd-bound services (extensions, context files, project tools)
 * for the new directory. The old session stays on disk, linked via
 * parentSession, and can be resumed with /resume.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { parseSwitchCommandArgs } from "./args.js";
import { createPendingSwitchRegistry } from "./pending.js";
import { resolveTargetDirectory } from "./paths.js";

const SWITCH_COMMAND = "/switch-session";

type SwitchSessionDetails = {
	directory: string;
	prompt?: string;
	status: "scheduled" | "error";
	error?: string;
};

function errorResult(directory: string, error: string, prompt?: string): {
	content: { type: "text"; text: string }[];
	details: SwitchSessionDetails;
	isError: true;
} {
	return {
		content: [{ type: "text", text: `Session switch failed: ${error}` }],
		details: { directory, prompt, status: "error", error },
		isError: true,
	};
}

/** Canonical form of a directory for same-dir comparison. */
function canonical(dir: string): string {
	try {
		return fs.realpathSync(dir);
	} catch {
		return path.resolve(dir);
	}
}

/**
 * Create the new session file for the target directory.
 *
 * `SessionManager.create()` computes the header and file path but does not
 * flush them to disk (the header is written lazily on the first append).
 * `switchSession` opens the path with `SessionManager.open()`, which falls
 * back to `process.cwd()` when the file does not exist — so the header must
 * be written here first, exactly as pi would flush it.
 */
function createTargetSessionFile(targetDir: string, parentSession: string | undefined): string {
	const sm = SessionManager.create(targetDir, undefined, parentSession ? { parentSession } : undefined);
	const sessionFile = sm.getSessionFile();
	const header = sm.getHeader();
	if (!sessionFile || !header) {
		throw new Error("Failed to create session file for the target directory.");
	}
	fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
	fs.writeFileSync(sessionFile, `${JSON.stringify(header)}\n`);
	return sessionFile;
}

export default function switchSessionExtension(pi: ExtensionAPI) {
	const pending = createPendingSwitchRegistry();

	pi.registerCommand("switch-session", {
		description: "Replace the current session with a new one in <directory>. Usage: /switch-session <directory> [prompt...]",
		handler: async (args, ctx) => {
			const parsed = parseSwitchCommandArgs(args);
			if (!parsed.ok) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}

			const resolution = resolveTargetDirectory(parsed.directory, ctx.cwd);
			if (!resolution.ok) {
				ctx.ui.notify(resolution.error, "error");
				return;
			}

			if (canonical(resolution.path) === canonical(ctx.cwd)) {
				ctx.ui.notify(`Already working in ${resolution.path}.`, "warning");
				return;
			}

			// Prefer the tool's stashed request (supports multiline prompts);
			// fall back to the command-line remainder for manual invocation.
			const pendingEntry = pending.take(resolution.path);
			const prompt = pendingEntry?.prompt ?? parsed.prompt;

			const parentSession = ctx.sessionManager.getSessionFile();
			// pi flushes session files lazily; a session with no user/model content
			// may have no file on disk yet. Only link a parent that exists.
			const parent = parentSession && fs.existsSync(parentSession) ? parentSession : undefined;
			ctx.ui.notify(`Switching session to ${resolution.path}...`, "info");
			try {
				const sessionFile = createTargetSessionFile(resolution.path, parent);
				const { cancelled } = await ctx.switchSession(sessionFile, {
					withSession: prompt
						? async (session) => {
								await session.sendUserMessage(prompt);
							}
						: undefined,
				});
				if (cancelled) {
					ctx.ui.notify("Session switch was cancelled.", "warning");
				}
			} catch (err) {
				ctx.ui.notify(`Session switch failed: ${String(err instanceof Error ? err.message : err)}`, "error");
			}
		},
	});

	pi.registerTool({
		name: "switch_session",
		label: "Switch Session",
		description: [
			"Replace the current session with a new one in a different working directory, optionally with an initial prompt sent to the new session.",
			"The current session is kept on disk (resumable later with /resume) but the agent will not see it again.",
			"After calling this tool, wrap up immediately and do not start new work: the switch happens when the current turn ends.",
			"Only call this when the user explicitly asked to work in a different directory, or when they clearly agreed to the switch.",
		].join(" "),
		promptSnippet:
			"Replace the current session with a new one in a different working directory, with an optional initial prompt. Destructive to the active session context; requires clear user intent.",
		promptGuidelines: [
			"Only call switch_session when the user explicitly requests moving to a different directory, or has agreed to it in the current conversation.",
		],
		parameters: Type.Object({
			directory: Type.String({
				description: "Target working directory. Absolute path, path relative to the current directory, or ~/ prefixed.",
			}),
			prompt: Type.Optional(
				Type.String({ description: "Initial prompt to send in the new session. Optional." }),
			),
		}),

		async execute(toolCallId, params, _signal, _onUpdate, ctx) {
			const prompt = params.prompt?.trim() || undefined;
			const resolution = resolveTargetDirectory(params.directory, ctx.cwd);
			if (!resolution.ok) {
				return errorResult(params.directory, resolution.error, prompt);
			}

			if (canonical(resolution.path) === canonical(ctx.cwd)) {
				return errorResult(resolution.path, "That is already the active working directory.", prompt);
			}

			pending.set({ directory: resolution.path, prompt, toolCallId });
			pi.sendUserMessage(`${SWITCH_COMMAND} ${resolution.path}`, {
				deliverAs: "followUp",
				expandPromptTemplates: true,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							`Session switch scheduled: ${resolution.path}`,
							prompt ? `Initial prompt: ${prompt}` : "No initial prompt.",
							"The switch runs when this turn ends. Wrap up now and do not start new work in this session.",
						].join("\n"),
					},
				],
				details: { directory: resolution.path, prompt, status: "scheduled" },
				terminate: true,
			};
		},

		renderCall(args, theme) {
			const dir = args.directory || "...";
			let text = theme.fg("toolTitle", theme.bold("switch_session ")) + theme.fg("accent", dir);
			const preview = args.prompt
				? args.prompt.length > 60
					? `${args.prompt.slice(0, 60)}...`
					: args.prompt
				: undefined;
			if (preview) text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, _opts, theme) {
			const details = result.details as SwitchSessionDetails | undefined;
			const text = result.content[0];
			if (!details || details.status !== "error") {
				const dir = details?.directory ?? "";
				return new Text(
					`${theme.fg("success", "✓")} ${theme.fg("toolOutput", dir ? `switching to ${dir} after this turn` : (text?.type === "text" ? text.text : ""))}`,
					0,
					0,
				);
			}
			const errorText = details.error ?? (text?.type === "text" ? text.text : "unknown error");
			return new Text(`${theme.fg("error", "✗")} ${theme.fg("error", errorText)}`, 0, 0);
		},
	});
}
