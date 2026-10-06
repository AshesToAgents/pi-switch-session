import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type TargetResolution = { ok: true; path: string } | { ok: false; error: string };

/**
 * Expand a leading `~` or `~/` to the user's home directory.
 */
function expandHome(input: string): string {
	if (input === "~") return os.homedir();
	if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
	return input;
}

/**
 * Resolve the target directory for a session switch.
 *
 * Accepts absolute paths, paths relative to `cwd`, and `~`-prefixed paths.
 * Returns the canonical (realpath) absolute path on success, or a
 * model-facing error message otherwise.
 */
export function resolveTargetDirectory(input: string, cwd: string): TargetResolution {
	const trimmed = input.trim();
	if (!trimmed) {
		return { ok: false, error: "No directory provided." };
	}

	const expanded = expandHome(trimmed);
	const absolute = path.resolve(cwd, expanded);

	let stat: fs.Stats;
	try {
		stat = fs.statSync(absolute);
	} catch {
		return { ok: false, error: `Directory does not exist: ${absolute}` };
	}

	if (!stat.isDirectory()) {
		return { ok: false, error: `Path is not a directory: ${absolute}` };
	}

	try {
		return { ok: true, path: fs.realpathSync(absolute) };
	} catch {
		return { ok: false, error: `Directory cannot be resolved: ${absolute}` };
	}
}
