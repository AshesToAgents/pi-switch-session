export interface PendingSwitch {
	/** Resolved absolute target directory (also the lookup key). */
	directory: string;
	/** Initial prompt for the new session, if any. */
	prompt?: string;
	/** Tool call that scheduled the switch, for diagnostics. */
	toolCallId: string;
}

/**
 * One-shot handoff of switch requests from the tool to the command handler.
 *
 * The tool runs during an agent turn where session replacement is not allowed;
 * it queues `/switch-session <directory>` as a follow-up user message and
 * stashes the full request (including multiline prompts) here. When the
 * command handler runs after the turn, it takes the matching entry. Module
 * state is safe because the command executes in the same extension runtime,
 * before the session (and its extensions) is replaced.
 */
export function createPendingSwitchRegistry() {
	const pending = new Map<string, PendingSwitch>();

	return {
		set(entry: PendingSwitch): void {
			pending.set(entry.directory, entry);
		},
		take(directory: string): PendingSwitch | undefined {
			const entry = pending.get(directory);
			if (entry !== undefined) pending.delete(directory);
			return entry;
		},
		clear(): void {
			pending.clear();
		},
	};
}
