---
name: cmux-workspace
description: >
  Create and manage cmux workspaces with split panes to orchestrate multiple agents or tasks
  in parallel. Use when asked to set up a multi-agent workspace, run tasks in parallel across
  panes, or create a custom terminal layout. Requires cmux.
---

# cmux Workspace Orchestration

Create workspace layouts and dispatch commands to multiple terminals in parallel using cmux.

## Quick Reference

```bash
# Workspace management
cmux new-workspace                          # Create workspace, returns ID
cmux list-workspaces --json                 # List all workspaces
cmux select-workspace --workspace <id>      # Switch to workspace
cmux close-workspace --workspace <id>       # Close workspace

# Splitting
cmux new-split right                        # Split focused pane right
cmux new-split down                         # Split focused pane down

# Surface targeting
cmux list-surfaces --json                   # List all surfaces in current workspace
cmux focus-surface --surface <id>           # Focus a surface
cmux send-surface --surface <id> "cmd\n"    # Send text to specific surface
cmux send-key-surface --surface <id> enter  # Send keypress to surface

# Identity
cmux identify --json                        # Show focused window/workspace/pane/surface
```

## Creating a Multi-Agent Layout

### Step-by-step approach (dynamic)

```bash
# 1. Create a fresh workspace
cmux new-workspace

# 2. Split into panes
cmux new-split right          # Now: left (focused) | right
cmux focus-surface --surface <left-id>
cmux new-split down           # Now: top-left | right
                              #      bot-left |

# 3. List surfaces to get IDs
cmux list-surfaces --json

# 4. Dispatch commands to each surface
cmux send-surface --surface surface:1 "cd ~/project && pi 'write API tests'\n"
cmux send-surface --surface surface:2 "cd ~/project && pi 'fix lint errors'\n"
cmux send-surface --surface surface:3 "cd ~/project && npm run dev\n"
```

### Declarative approach (cmux.json)

Create `cmux.json` in the project root — commands appear in the command palette (⌘⇧P):

```json
{
  "commands": [
    {
      "name": "3-Agent Sprint",
      "keywords": ["agents", "parallel", "sprint"],
      "restart": "confirm",
      "workspace": {
        "name": "Sprint",
        "cwd": ".",
        "color": "#3b82f6",
        "layout": {
          "direction": "horizontal",
          "split": 0.5,
          "children": [
            {
              "pane": {
                "surfaces": [
                  {
                    "type": "terminal",
                    "name": "Agent 1",
                    "command": "pi 'task description here'",
                    "focus": true
                  }
                ]
              }
            },
            {
              "direction": "vertical",
              "split": 0.5,
              "children": [
                {
                  "pane": {
                    "surfaces": [
                      {
                        "type": "terminal",
                        "name": "Agent 2",
                        "command": "pi 'second task'"
                      }
                    ]
                  }
                },
                {
                  "pane": {
                    "surfaces": [
                      {
                        "type": "terminal",
                        "name": "Dev Server",
                        "command": "npm run dev"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

### Layout patterns

**Two agents side-by-side:**
```
horizontal split 0.5 → [Agent A] | [Agent B]
```

**Agent + dev server + browser:**
```
horizontal split 0.5 → [Agent] | vertical split 0.6 → [Browser preview]
                                                       [Dev server]
```

**Three agents:**
```
horizontal split 0.33 → [A] | horizontal split 0.5 → [B] | [C]
```

## Sending Commands to Surfaces

```bash
# Send a command (include \n to execute)
cmux send-surface --surface surface:2 "npm test\n"

# Send text without executing (no \n)
cmux send-surface --surface surface:2 "partial command"

# Send special keys
cmux send-key-surface --surface surface:2 enter
cmux send-key-surface --surface surface:2 escape
cmux send-key-surface --surface surface:2 tab
```

## Monitoring (combine with cmux-notify skill)

After dispatching agents, use sidebar metadata to track them:
```bash
cmux set-status agent1 "Running" --color "#3b82f6"
cmux set-status agent2 "Running" --color "#3b82f6"
# ... later, from each agent's surface ...
cmux set-status agent1 "Done ✓" --color "#22c55e"
```

## Rules
1. **Always use `--json`** when you need to parse output (workspace IDs, surface IDs)
2. **Include `\n`** in send-surface to execute commands; omit to just type
3. **List surfaces after splitting** to discover the new IDs
4. **Use descriptive workspace names** so the sidebar is useful
5. **Prefer cmux.json** for recurring layouts — it's reusable and version-controllable
6. **Combine with cmux-notify** — set status pills per agent for at-a-glance monitoring
