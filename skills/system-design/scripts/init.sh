#!/bin/bash
# Initialize a system design project with templates and checklist.
# Usage: bash init.sh [project-root]

set -e

PROJECT_ROOT="${1:-.}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$PROJECT_ROOT"

# Copy checklist
if [ ! -f "$PROJECT_ROOT/system-design-checklist.md" ]; then
  cp "$SKILL_DIR/templates/checklist.md" "$PROJECT_ROOT/system-design-checklist.md"
  echo "✓ Created system-design-checklist.md"
else
  echo "· system-design-checklist.md already exists, skipping"
fi

# Copy system design template
if [ ! -f "$PROJECT_ROOT/system-design.md" ]; then
  cp "$SKILL_DIR/templates/system-design.md" "$PROJECT_ROOT/system-design.md"
  echo "✓ Created system-design.md"
else
  echo "· system-design.md already exists, skipping"
fi

# Copy glossary
if [ ! -f "$PROJECT_ROOT/glossary.md" ]; then
  cp "$SKILL_DIR/templates/glossary.md" "$PROJECT_ROOT/glossary.md"
  echo "✓ Created glossary.md"
else
  echo "· glossary.md already exists, skipping"
fi

echo ""
echo "System design project initialized in $PROJECT_ROOT"
echo "Files:"
echo "  system-design-checklist.md  — tracks progress through 10 phases"
echo "  system-design.md            — the design document skeleton"
echo "  glossary.md                 — industry-verified terminology"
