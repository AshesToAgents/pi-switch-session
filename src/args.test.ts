import { describe, expect, it } from "vitest";
import { parseSwitchCommandArgs } from "./args.js";

describe("parseSwitchCommandArgs", () => {
	it("parses a bare directory", () => {
		expect(parseSwitchCommandArgs("/some/dir")).toEqual({ ok: true, directory: "/some/dir" });
	});

	it("parses a directory with a prompt", () => {
		expect(parseSwitchCommandArgs("/some/dir fix the build")).toEqual({
			ok: true,
			directory: "/some/dir",
			prompt: "fix the build",
		});
	});

	it("keeps the prompt as a single string including internal whitespace", () => {
		expect(parseSwitchCommandArgs("  ./repo   hello   world  ")).toEqual({
			ok: true,
			directory: "./repo",
			prompt: "hello   world",
		});
	});

	it("rejects empty args", () => {
		const result = parseSwitchCommandArgs("   ");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/usage/i);
	});
});
