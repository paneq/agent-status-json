# agent-status-json

A Claude Code mod that writes what the session is doing to a JSON file, so another program (for example a Herdr desktop app mod) can show it without parsing the terminal.

On every state change it writes `~/.maestro/_herdr_mod/<session-id>/agent-status.json`:

```json
{
  "v": 1,
  "session_id": "0cde5b63-…",
  "cwd": "/workspace",
  "state": "idle",
  "event": "Stop",
  "updated_at": "2026-11-02T12:00:00.000Z",
  "background_tasks": [
    { "id": "b1", "type": "shell", "status": "running", "description": "Build", "command": "cargo build --release" }
  ],
  "loops": [
    { "id": "c1", "schedule": "*/5 * * * *", "recurring": true, "prompt": "check the deploy" }
  ]
}
```

`state` is one of `working`, `idle`, `blocked` (a permission prompt, a question or a dialog waits for you), `error` (the turn ended on an API error) or `ended` (Claude exited). `background_tasks` and `loops` are what Claude reports at the end of each turn: shells, subagents, monitors and workflows still running, and the `/loop`, `CronCreate` and `ScheduleWakeup` schedules that will wake the session.

## Install

At the prompt of a Claude Code session:

```
/plugin install agent-status-json --marketplace paneq/agent-status-json
```

From a shell:

```
claude plugin install agent-status-json --marketplace paneq/agent-status-json
```

## Limits

- The lists refresh when a turn or a subagent ends. A background shell that finishes while the session is idle shows until Claude's next turn.
- Needs a Claude Code version with mods (hooks modules); the `background_tasks` and `session_crons` fields were checked on 2.1.314.
