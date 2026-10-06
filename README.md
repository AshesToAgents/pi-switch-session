# pi-switch-session

A [pi](https://github.com/earendil-works/pi) extension that adds a `switch_session` tool letting the agent replace the active session with a new one in a different working directory, optionally with an initial prompt.

## Install

```bash
# Global (user-level)
pi install ssh://git@github.com/AshesToAgents/pi-switch-session.git

# Project-level (shared with team via .pi/settings.json)
pi install -l ssh://git@github.com/AshesToAgents/pi-switch-session.git

# Try without installing
pi -e ssh://git@github.com/AshesToAgents/pi-switch-session.git
```

## What's Included

| Type | Name | Description |
|------|------|-------------|
| Tool | `switch_session` | Replace the active session with a new one in another directory, with an optional initial prompt |
| Command | `/switch-session` | Same switch, invoked manually |

## Usage

### `switch_session`

The agent calls the tool when the user asks to move to a different project/directory:

```json
{
  "directory": "~/projects/other-repo",
  "prompt": "Look at the failing tests and figure out what's going on"
}
```

Behavior:

1. Resolves and validates the target directory (absolute, `~`-prefixed, or relative to the current directory).
2. Queues the switch to run when the current turn ends — the tool returns `terminate: true` and the model wraps up.
3. A fresh session is created with the target directory as its working directory; all cwd-bound services (extensions, context files, project tools) are recreated for it.
4. If a `prompt` was given, it is sent as the first user message in the new session.

The previous session is kept on disk and linked as the new session's parent, so `/resume` gets you back to it. There is no confirmation dialog — the tool description instructs the agent to only call it with clear user intent.

### `/switch-session <directory> [prompt...]`

Manual invocation of the same switch:

```
/switch-session ~/projects/other-repo fix the failing tests
```

Multiline prompts are only supported through the tool (the command line is single-line).

## Notes

- Session replacement is only safe from a command context, so the tool bridges through a queued `/switch-session` command (via `sendUserMessage` with `expandPromptTemplates`). The switch therefore always happens at a turn boundary, never mid-turn.
- Targeted at interactive (TUI) and RPC use; print/JSON modes are untested.
- Queued messages that were still pending in the old session do not carry over.

## Development

```bash
npm run typecheck
npm test
```
