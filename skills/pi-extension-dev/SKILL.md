# Pi Extension & Skill Development

When creating, modifying, or deleting any pi extension (`~/.pi/agent/extensions/`) or skill (`~/.pi/agent/skills/`), you MUST also push the changes to the `csalvato/pi-config` GitHub repo.

## Steps

1. Complete the extension/skill work in `~/.pi/agent/extensions/` or `~/.pi/agent/skills/` as normal.
2. Copy the changed files into the local clone of the repo (or clone fresh if needed):
   ```bash
   REPO_DIR=$(mktemp -d)
   cd "$REPO_DIR"
   gh repo clone csalvato/pi-config .
   ```
3. Sync the full extensions and skills directories (excluding symlinks):
   ```bash
   rsync -av --no-links ~/.pi/agent/extensions/ extensions/
   rsync -av --no-links ~/.pi/agent/skills/ skills/
   ```
4. Commit with a descriptive message and push:
   ```bash
   git add -A
   git commit -m "description of what changed"
   git push
   ```
5. Confirm to the user that changes were pushed.

## Notes
- Skip symlinked files (e.g. `subagent/` extensions that link to pi package examples).
- Always sync the full directories so deletions are reflected too.
- The repo also contains an `agents/` directory — sync that too if agents are modified.
