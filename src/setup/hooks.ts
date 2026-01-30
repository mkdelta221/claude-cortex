/**
 * CLI handler for hook subcommands.
 * Spawns the actual hook scripts with stdin/stdout passthrough.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Scripts are in ../scripts/ relative to dist/setup/
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', 'scripts');

const HOOKS: Record<string, string> = {
  'pre-compact': 'pre-compact-hook.mjs',
  'session-start': 'session-start-hook.mjs',
  'session-end': 'session-end-hook.mjs',
};

export async function handleHookCommand(hookName: string): Promise<void> {
  const scriptFile = HOOKS[hookName];
  if (!scriptFile) {
    console.error(`Unknown hook: ${hookName}`);
    console.log(`Available hooks: ${Object.keys(HOOKS).join(', ')}`);
    console.log('Usage: claude-cortex hook <pre-compact|session-start|session-end>');
    process.exit(1);
  }

  const scriptPath = path.join(SCRIPTS_DIR, scriptFile);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  // Pipe stdin through to the child
  process.stdin.pipe(child.stdin);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
