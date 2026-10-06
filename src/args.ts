export type ParsedSwitchArgs = { ok: true; directory: string; prompt?: string } | { ok: false; error: string };

const USAGE = "Usage: /switch-session <directory> [prompt...]";

/**
 * Parse the raw argument string of `/switch-session`.
 *
 * The first whitespace-separated token is the directory; everything after it
 * (with internal whitespace preserved) is the optional initial prompt.
 */
export function parseSwitchCommandArgs(args: string): ParsedSwitchArgs {
	const trimmed = args.trim();
	if (!trimmed) {
		return { ok: false, error: `No arguments provided. ${USAGE}` };
	}

	// Split off the directory token, keep the remainder verbatim.
	const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) {
		return { ok: false, error: USAGE };
	}

	const directory = match[1];
	const prompt = match[2]?.trim();

	return prompt ? { ok: true, directory, prompt } : { ok: true, directory };
}
