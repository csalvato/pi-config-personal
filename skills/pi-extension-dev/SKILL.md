---
name: pi-extension-dev
description: >
  Sync local pi extensions, skills, and prompt/agent files to the correct GitHub config repo
  (personal vs work-specific) whenever creating, modifying, or deleting them. Use when working
  on pi configuration that should be preserved outside the local machine.
---

# Pi Extension & Skill Development

When creating, modifying, or deleting any pi extension (`~/.pi/agent/extensions/`) or skill (`~/.pi/agent/skills/`), you MUST also push the changes to the appropriate GitHub repo.

## Repos

There are two repos — one public for generic config, one private for work-specific config:

| Repo | Visibility | Content |
|------|-----------|---------|
| `csalvato/pi-config-personal` | **Public** | Generic extensions, skills, and agents (portable, no employer-specific references) |
| `csalvato/pi-config-block` | **Private** | Work-specific extensions and skills (internal tools, internal domains, VPN, etc.) |

## Which repo?

- If the extension/skill references **employer-internal tooling** (internal knowledge bases, HR platforms, internal CLI tools, VPN requirements, internal domains/URLs, internal email domains) → **private work repo**
- Everything else → **public personal repo**

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
- `csalvato/pi-config` is archived — do not use it.
