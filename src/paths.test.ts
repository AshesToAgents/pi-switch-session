import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTargetDirectory } from "./paths.js";

let tmpDirs: string[] = [];

function makeTmpDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-switch-session-test-"));
	tmpDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tmpDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	tmpDirs = [];
});

describe("resolveTargetDirectory", () => {
	it("resolves an absolute path to its realpath", () => {
		const dir = makeTmpDir();
		const result = resolveTargetDirectory(dir, "/some/cwd");
		expect(result).toEqual({ ok: true, path: fs.realpathSync(dir) });
	});

	it("resolves a relative path against cwd", () => {
		const parent = makeTmpDir();
		const target = path.join(parent, "sub");
		fs.mkdirSync(target);
		const result = resolveTargetDirectory("sub", parent);
		expect(result).toEqual({ ok: true, path: fs.realpathSync(target) });
	});

	it("expands ~ to the home directory", () => {
		const result = resolveTargetDirectory("~/..", "/some/cwd");
		// ~/.. is the parent of home, which always exists and is a directory
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.path).toBe(fs.realpathSync(path.join(os.homedir(), "..")));
		}
	});

	it("expands a ~-prefixed path", () => {
		const result = resolveTargetDirectory("~", "/some/cwd");
		expect(result).toEqual({ ok: true, path: fs.realpathSync(os.homedir()) });
	});

	it("trims whitespace around the input", () => {
		const dir = makeTmpDir();
		const result = resolveTargetDirectory(`  ${dir}  `, "/some/cwd");
		expect(result).toEqual({ ok: true, path: fs.realpathSync(dir) });
	});

	it("rejects empty input", () => {
		const result = resolveTargetDirectory("   ", "/some/cwd");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/no directory/i);
	});

	it("rejects a nonexistent directory", () => {
		const result = resolveTargetDirectory("/definitely/does/not/exist", "/some/cwd");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/does not exist/i);
	});

	it("rejects a path that is a file", () => {
		const dir = makeTmpDir();
		const file = path.join(dir, "some-file.txt");
		fs.writeFileSync(file, "x");
		const result = resolveTargetDirectory(file, dir);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/not a directory/i);
	});
});
