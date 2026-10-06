import { describe, expect, it } from "vitest";
import { createPendingSwitchRegistry } from "./pending.js";

describe("createPendingSwitchRegistry", () => {
	it("take() returns and removes a pending entry for a matching directory", () => {
		const registry = createPendingSwitchRegistry();
		registry.set({ directory: "/a", prompt: "do it", toolCallId: "t1" });

		expect(registry.take("/a")).toEqual({ directory: "/a", prompt: "do it", toolCallId: "t1" });
		expect(registry.take("/a")).toBeUndefined();
	});

	it("take() does not match a different directory", () => {
		const registry = createPendingSwitchRegistry();
		registry.set({ directory: "/a", toolCallId: "t1" });

		expect(registry.take("/b")).toBeUndefined();
		expect(registry.take("/a")).toEqual({ directory: "/a", toolCallId: "t1" });
	});

	it("set() overwrites an entry for the same directory", () => {
		const registry = createPendingSwitchRegistry();
		registry.set({ directory: "/a", prompt: "first", toolCallId: "t1" });
		registry.set({ directory: "/a", prompt: "second", toolCallId: "t2" });

		expect(registry.take("/a")).toEqual({ directory: "/a", prompt: "second", toolCallId: "t2" });
	});

	it("keeps separate entries for different directories", () => {
		const registry = createPendingSwitchRegistry();
		registry.set({ directory: "/a", toolCallId: "t1" });
		registry.set({ directory: "/b", toolCallId: "t2" });

		expect(registry.take("/b")).toEqual({ directory: "/b", toolCallId: "t2" });
		expect(registry.take("/a")).toEqual({ directory: "/a", toolCallId: "t1" });
	});

	it("clear() empties the registry", () => {
		const registry = createPendingSwitchRegistry();
		registry.set({ directory: "/a", toolCallId: "t1" });
		registry.clear();

		expect(registry.take("/a")).toBeUndefined();
	});
});
