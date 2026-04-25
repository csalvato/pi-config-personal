# Pi Extension & Skill Development

When creating, modifying, or deleting any pi extension (`~/.pi/agent/extensions/`) or skill (`~/.pi/agent/skills/`), you MUST also push the changes to the appropriate GitHub repo.

## Repos

| Repo | Visibility | Content |
|------|-----------|---------|
| `csalvato/pi-config-personal` | **Public** | Generic extensions/skills/agents (no Block references) |
| `csalvato/pi-config-block` | **Private** | Block-specific extensions/skills (Glean, The Hub, sq agent-tools, etc.) |

## Which repo?

- If the extension/skill references Block internals (Glean, The Hub, sq agent-tools, WARP VPN, `@block.xyz`, `@squareup.com`, `sqprod.co`, `go/` links, Workday) → **pi-config-block**
- Everything else → **pi-config-personal**

## Steps

1. Complete the extension/skill work in `~/.pi/agent/extensions/` or `~/.pi/agent/skills/` as normal.
2. Clone the appropriate repo:
   ```bash
   REPO_DIR=$(mktemp -d)
   cd "$REPO_DIR"
   gh repo clone csalvato/pi-config-personal .   # or pi-config-block
   ```
3. Copy the changed files into the correct directory (`extensions/`, `skills/`, or `agents/`).
4. Commit with a descriptive message and push:
   ```bash
   git add -A
   git commit -m "description of what changed"
   git push
   ```
5. Confirm to the user that changes were pushed and to which repo.

## Notes
- Skip symlinked files (e.g. `subagent/` extensions that link to pi package examples).
- If unsure which repo, ask the user.
- The `pi-config` repo (private) is the legacy combined repo — no longer update it.
