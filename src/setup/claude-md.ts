/**
 * Injects proactive memory instructions into ~/.claude/CLAUDE.md
 * Idempotent — skips if instructions already present.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const MARKER = '# Claude Cortex — Memory System';

const INSTRUCTIONS = `
${MARKER}

You have access to a persistent memory system via MCP tools (\`remember\`, \`recall\`, \`get_context\`, \`forget\`).

**MUST use \`remember\` immediately when any of these occur:**
- A decision is made (architecture, library choice, approach)
- A bug is fixed (capture root cause + solution)
- Something new is learned about the codebase
- User states a preference
- A significant feature is completed

Do not wait until the end of the session. Call \`remember\` right after the event happens.
`;

export async function setupClaudeMd(): Promise<void> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  // Ensure ~/.claude/ exists
  fs.mkdirSync(claudeDir, { recursive: true });

  // Read existing content
  let existing = '';
  if (fs.existsSync(claudeMdPath)) {
    existing = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  // Check if already configured
  if (existing.includes(MARKER)) {
    console.log('✓ Claude Cortex instructions already present in ~/.claude/CLAUDE.md');
    return;
  }

  // Append instructions
  const newContent = existing.trimEnd() + '\n' + INSTRUCTIONS;
  fs.writeFileSync(claudeMdPath, newContent, 'utf-8');

  console.log('✓ Added Claude Cortex memory instructions to ~/.claude/CLAUDE.md');
  console.log('  Claude will now proactively use memory tools in all projects.');
}
