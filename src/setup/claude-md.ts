/**
 * Full setup for Claude Cortex.
 *
 * 1. Injects proactive memory instructions into ~/.claude/CLAUDE.md (Claude Code)
 * 2. Installs cortex-memory hook into Clawdbot/Moltbot if detected
 *
 * Both steps are idempotent.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { installClawdbotHook, findClawdbotHooksDir } from './clawdbot.js';

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

function setupClaudeCode(): void {
  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  fs.mkdirSync(claudeDir, { recursive: true });

  let existing = '';
  if (fs.existsSync(claudeMdPath)) {
    existing = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  if (existing.includes(MARKER)) {
    console.log('✓ Claude Code: instructions already present in ~/.claude/CLAUDE.md');
  } else {
    const newContent = existing.trimEnd() + '\n' + INSTRUCTIONS;
    fs.writeFileSync(claudeMdPath, newContent, 'utf-8');
    console.log('✓ Claude Code: added memory instructions to ~/.claude/CLAUDE.md');
  }
}

export async function setupClaudeMd(): Promise<void> {
  console.log('Setting up Claude Cortex...\n');

  // 1. Claude Code — always
  setupClaudeCode();

  // 2. Clawdbot/Moltbot — if detected
  const hooksDir = findClawdbotHooksDir();
  if (hooksDir) {
    const hookExists = fs.existsSync(path.join(hooksDir, 'cortex-memory'));
    if (hookExists) {
      console.log('✓ Clawdbot: cortex-memory hook already installed');
    } else {
      await installClawdbotHook();
    }
  } else {
    console.log('- Clawdbot/Moltbot: not detected (skipped)');
  }

  console.log('\nSetup complete.');
}
