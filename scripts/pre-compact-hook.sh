#!/bin/bash
# Pre-compact hook for Claude Memory
# This script runs before context compaction (manual or auto)
# It outputs a reminder to save important context to memory

# Read the hook input from stdin
INPUT=$(cat)

# Parse the trigger type (manual or auto)
TRIGGER=$(echo "$INPUT" | grep -o '"trigger":"[^"]*"' | cut -d'"' -f4)

# Output a system reminder that will be shown to Claude
# Using stderr with exit 2 shows the message to Claude
cat << 'EOF' >&2
⚠️ CONTEXT COMPACTION IMMINENT

Before this compaction completes, please use the memory tools to save any important context:

1. Key decisions made in this session
2. Important code patterns discovered
3. User preferences or requirements learned
4. Any pending tasks or TODOs

Use `remember` to save important items, then compaction will proceed.
EOF

# Exit with 0 to allow compaction to proceed
# (Exit 2 would block and show the message, but we want non-blocking)
exit 0
