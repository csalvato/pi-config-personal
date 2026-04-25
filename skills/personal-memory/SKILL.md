---
name: personal-memory
description: >
  Persistent memory and personal context via the user's Logseq knowledge graph, indexed by QMD.
  Use this skill PROACTIVELY: (1) at the START of every conversation to retrieve relevant context
  about the user, their preferences, past decisions, and prior work; (2) to STORE new learnings,
  decisions, outcomes, preferences, and notable context at the end of a task or when something
  worth remembering comes up; (3) whenever the user asks about something you've discussed before
  or references past work. This is your long-term memory — use it.
---

# Personal Memory & Context

You have access to the user's personal Logseq knowledge graph at:
`/Users/csalvato/Documents/logseq-graph/`

It is indexed by QMD and searchable via the `qmd` CLI. Changes to the graph are
automatically re-indexed (fswatch + periodic launchd job).

## When to READ (search for context)

**Do this proactively — don't wait to be asked.**

- **Start of conversation:** Search for context relevant to what the user is asking about.
  Think: "What do I already know about this topic from past interactions?"
- **When the user references past work:** "that thing we did", "like last time", "my preference for X"
- **Before making recommendations:** Check if the user has recorded preferences or past decisions on the topic.
- **When working on a project:** Search for related notes, decisions, architecture docs, or journal entries.

### How to search

```bash
# Semantic search — best for "what do I know about X?"
qmd query "topic or question" -c logseq

# Keyword search — best for specific terms, names, dates
qmd search "specific term" -c logseq

# Get a specific page
qmd get "pages/some-page.md" -c logseq --full

# Get recent journal entries for broader context
qmd multi-get "journals/2026-04*.md" -c logseq
```

## When to WRITE (store new memories)

**Do this when something worth remembering happens.**

- A decision was made (and the reasoning behind it)
- A user preference was expressed or discovered
- A task was completed (what was done, how, outcome)
- Something was learned (a gotcha, a technique, a tool setup)
- A project was started or reached a milestone
- Configuration or environment details that might be needed later

### How to write

Store memories as Logseq-formatted markdown pages. Use the appropriate location:

**For dated/ephemeral context** (what we did today, daily learnings):

Append to today's journal file (`YYYY_MM_DD.md`). **Important:** All agent-written
activity entries MUST go under the `- Actions Taken` block, indented with a single tab.
This keeps agent output separate from the user's own notes.

```bash
# First, check if today's journal and Actions Taken block exist
JOURNAL="/Users/csalvato/Documents/logseq-graph/journals/$(date +%Y_%m_%d).md"

# If the file doesn't exist or doesn't have an Actions Taken block, add one
if [ ! -f "$JOURNAL" ] || ! grep -q "^- Actions Taken" "$JOURNAL"; then
  echo "" >> "$JOURNAL"
  echo "- Actions Taken" >> "$JOURNAL"
fi

# Append entries UNDER the Actions Taken block (tab-indented)
# Use sed to insert after the "- Actions Taken" line
sed -i '' '/^- Actions Taken$/a\
\tYour entry here' "$JOURNAL"
```

Alternatively, if the `- Actions Taken` block is already the last block in the file
(which it typically is), you can simply append tab-indented lines:

```bash
JOURNAL="/Users/csalvato/Documents/logseq-graph/journals/$(date +%Y_%m_%d).md"
if [ ! -f "$JOURNAL" ] || ! grep -q "^- Actions Taken" "$JOURNAL"; then
  printf '\n- Actions Taken\n' >> "$JOURNAL"
fi
printf '\t- Your entry here\n' >> "$JOURNAL"
```

**Never write top-level bullets (`- `) for activity/task entries.** Those are reserved
for the user's own meeting notes, observations, and manual entries. Agent entries are
always children of `- Actions Taken`.

**For durable/topical knowledge** (preferences, project notes, tool configs):
```bash
# Create or update a dedicated page
cat > /Users/csalvato/Documents/logseq-graph/pages/topic-name.md << 'EOF'
- Summary of the topic
  - Key detail 1
  - Key detail 2
  - Related: [[Other Page]]
EOF
```

### Logseq formatting rules

- Every line is a bullet: start with `- ` (top-level) or `  - ` (indented child)
- Link to other pages with `[[Page Name]]`
- Use `#tag` for categorical tags
- Properties go on the line after a bullet: `key:: value`
- Don't use headings (`#`, `##`) — Logseq uses bullets for hierarchy
- File naming: pages use `kebab-case.md`, journals use `YYYY_MM_DD.md`

### What makes a good memory entry

**Journal entry (under Actions Taken):**
```markdown
- Actions Taken
	- Configured QMD to index Logseq graph #tools #setup
		- Installed via `npm install -g @tobilu/qmd`
		- Collection: `logseq` pointing to `~/Documents/logseq-graph`
		- Auto-reindex via fswatch watcher + launchd periodic job (every 30 min)
		- Related: [[dev-tools]] [[pi-setup]]
```

**Page entry (for durable knowledge):**
```markdown
- Summary of the topic
  - Key detail 1
  - Key detail 2
  - Related: [[Other Page]]
```

Be specific. Include commands, paths, versions, and reasoning. Future-you will thank past-you.

## Context hierarchy

When answering questions, layer context from most to least personal:

1. **Logseq graph (QMD)** — The user's own notes, decisions, preferences, and history
2. **Current project files** — Code, docs, and config in the working directory
3. **Glean / internal docs** — Company knowledge base
4. **General knowledge** — Your training data

Always check layer 1 first when the topic might have personal context.
