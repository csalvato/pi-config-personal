# Pi Config — Personal

Personal (non-work-specific) configuration for [pi](https://github.com/mariozechner/pi-coding-agent) — extensions, skills, agents, and global instructions.

## Global Instructions

| File | Description |
|------|-------------|
| `AGENTS.md` | Global writing rules loaded into every pi session. Copy to `~/.pi/agent/AGENTS.md`. |

Pi loads `~/.pi/agent/AGENTS.md` at startup for every session, then layers project
context files on top. Use `--no-context-files` to skip it.

For rules that cannot be skipped by a flag, rename the file to `APPEND_SYSTEM.md`.
Pi appends that file to the system prompt instead.

## Extensions

| Extension | Description |
|-----------|-------------|
| `cmux-notify.ts` | Cmux notification integration |
| `cmux-tab-title.ts` | Cmux tab title management |
| `plan-mode/` | Read-only planning mode with todo tracking |
| `pr-tracker.ts` | PR tracking utilities |
| `questionnaire.ts` | Interactive single- and multi-question UI tool |
| `web-search.ts` | Web search via DuckDuckGo + Jina Reader |
| `wezterm-tab-title.ts` | WezTerm tab title management |
| `worktree.ts` | Git worktree management |

## Skills

| Skill | Description |
|-------|-------------|
| `cmux-browser` | Browser control in cmux panes |
| `cmux-notify` | Cmux notifications for long-running tasks |
| `cmux-sidebar` | Cmux sidebar status display |
| `cmux-workspace` | Multi-pane cmux workspace management |
| `personal-memory` | Persistent memory via Logseq/QMD |
| `pi-extension-dev` | Sync local pi extensions/skills to the right GitHub config repo |
| `system-design` | Structured multi-phase system design workflow |

## Agents

| Agent | Description |
|-------|-------------|
| `planner.md` | Planning agent |
| `reviewer.md` | Code review agent |
| `scout.md` | Research/scouting agent |
| `truth-seeker.md` | Fact-checking agent |
| `worker.md` | Task execution agent |

## Installation

```bash
git clone git@github.com:csalvato/pi-config-personal.git
# Copy or symlink into ~/.pi/agent/
cp AGENTS.md ~/.pi/agent/AGENTS.md
```
