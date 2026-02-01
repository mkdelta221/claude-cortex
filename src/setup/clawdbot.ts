/**
 * OpenClaw/Clawdbot hook installer.
 *
 * Copies the cortex-memory hook into Clawdbot's bundled hooks directory.
 * Only works if Clawdbot is installed on the system.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOK_NAME = 'cortex-memory';

// Hook source is in hooks/clawdbot/cortex-memory/ relative to project root
// From dist/setup/, go up two levels to project root
const HOOK_SOURCE = path.resolve(__dirname, '..', '..', 'hooks', 'clawdbot', HOOK_NAME);

/**
 * Find Clawdbot's bundled hooks directory by locating the binary
 */
export function findClawdbotHooksDir(): string | null {
  try {
    const binPath = execSync('which openclaw 2>/dev/null || which clawdbot 2>/dev/null || which moltbot 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();

    if (!binPath) return null;

    // Resolve symlink — lands in e.g. <prefix>/lib/node_modules/clawdbot/dist/entry.js
    const realBin = fs.realpathSync(binPath);

    // Walk up from resolved path to find dist/hooks/bundled/
    let dir = path.dirname(realBin);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, 'hooks', 'bundled');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      // Also check dist/hooks/bundled from current dir
      const distCandidate = path.join(dir, 'dist', 'hooks', 'bundled');
      if (fs.existsSync(distCandidate)) {
        return distCandidate;
      }
      dir = path.dirname(dir);
    }

    return null;
  } catch {
    return null;
  }
}

export async function installClawdbotHook(): Promise<void> {
  const hooksDir = findClawdbotHooksDir();

  if (!hooksDir) {
    console.error('OpenClaw/Clawdbot is not installed on this system.');
    console.log('Install it first: npm install -g clawdbot');
    process.exit(1);
  }

  if (!fs.existsSync(HOOK_SOURCE)) {
    console.error('Hook source files not found. Package may be corrupted.');
    process.exit(1);
  }

  const destDir = path.join(hooksDir, HOOK_NAME);

  // Copy hook files
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of ['HOOK.md', 'handler.js']) {
    const src = path.join(HOOK_SOURCE, file);
    const dest = path.join(destDir, file);
    fs.copyFileSync(src, dest);
  }

  console.log(`✓ Installed cortex-memory hook to ${destDir}`);
  console.log('  The hook will activate on next Clawdbot restart.');
  console.log('');
  console.log('  What it does:');
  console.log('  • Auto-saves important session context on /new');
  console.log('  • Injects past memories on session start');
  console.log('  • "remember this: ..." keyword trigger');
}

export async function uninstallClawdbotHook(): Promise<void> {
  const hooksDir = findClawdbotHooksDir();

  if (!hooksDir) {
    console.log('OpenClaw/Clawdbot is not installed on this system.');
    return;
  }

  const destDir = path.join(hooksDir, HOOK_NAME);

  if (!fs.existsSync(destDir)) {
    console.log('cortex-memory hook is not installed.');
    return;
  }

  fs.rmSync(destDir, { recursive: true });
  console.log(`✓ Removed cortex-memory hook from ${destDir}`);
}

export async function clawdbotHookStatus(): Promise<void> {
  const hooksDir = findClawdbotHooksDir();

  if (!hooksDir) {
    console.log('OpenClaw/Clawdbot: not installed');
    return;
  }

  const destDir = path.join(hooksDir, HOOK_NAME);
  const installed = fs.existsSync(destDir);

  console.log(`OpenClaw/Clawdbot: installed`);
  console.log(`Hooks directory:  ${hooksDir}`);
  console.log(`cortex-memory:    ${installed ? 'installed' : 'not installed'}`);
}

export async function handleClawdbotCommand(subcommand: string): Promise<void> {
  switch (subcommand) {
    case 'install':
      await installClawdbotHook();
      break;
    case 'uninstall':
      await uninstallClawdbotHook();
      break;
    case 'status':
      await clawdbotHookStatus();
      break;
    default:
      console.log('Usage: claude-cortex clawdbot <install|uninstall|status>');
      process.exit(1);
  }
}
