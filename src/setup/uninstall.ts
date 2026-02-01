/**
 * Uninstall routines for Claude Cortex.
 *
 * - removeHooks(): strips cortex hooks from ~/.claude/settings.json
 * - removeClaudeMdBlock(): removes cortex instruction block from ~/.claude/CLAUDE.md
 * - uninstallSetup(): reverses `npx claude-cortex setup`
 * - uninstallAll(): full uninstall (setup + service + clawdbot)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_MD_PATH = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const MARKER = '# Claude Cortex — Memory System';

// ---------------------------------------------------------------------------
// Hooks removal
// ---------------------------------------------------------------------------

interface HookEntry {
  hooks?: Array<{ type?: string; command?: string }>;
  [key: string]: unknown;
}

function isCortexEntry(entry: HookEntry): boolean {
  return !!entry.hooks?.some(
    (h) => typeof h.command === 'string' && h.command.includes('claude-cortex'),
  );
}

export function removeHooks(): void {
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log('  - settings.json not found (nothing to remove)');
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! Failed to parse settings.json: ${msg}`);
    console.error('    Skipping hook removal to avoid corruption');
    return;
  }

  const hooks = settings.hooks as Record<string, HookEntry[]> | undefined;
  if (!hooks || typeof hooks !== 'object') {
    console.log('  - No hooks in settings.json');
    return;
  }

  let removed = 0;
  const hookTypes = ['PreCompact', 'SessionStart', 'SessionEnd', 'Stop'];

  for (const name of hookTypes) {
    if (!Array.isArray(hooks[name])) continue;

    const before = hooks[name].length;
    hooks[name] = hooks[name].filter((entry) => !isCortexEntry(entry));
    const delta = before - hooks[name].length;

    if (delta > 0) {
      removed += delta;
      console.log(`  - Removed: ${name} hook`);
    }

    // Clean up empty arrays
    if (hooks[name].length === 0) {
      delete hooks[name];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }

  if (removed > 0) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    console.log(`  ${removed} hook(s) removed from settings.json`);
  } else {
    console.log('  - No cortex hooks found in settings.json');
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md block removal
// ---------------------------------------------------------------------------

export function removeClaudeMdBlock(): void {
  if (!fs.existsSync(CLAUDE_MD_PATH)) {
    console.log('  - CLAUDE.md not found (nothing to remove)');
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! Failed to read CLAUDE.md: ${msg}`);
    return;
  }

  const markerIdx = content.indexOf(MARKER);
  if (markerIdx === -1) {
    console.log('  - No cortex block in CLAUDE.md');
    return;
  }

  const before = content.slice(0, markerIdx);

  // Find the next top-level heading after the marker
  const afterMarker = content.slice(markerIdx + MARKER.length);
  const nextHeadingMatch = afterMarker.match(/\n# /);

  let after = '';
  if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
    // Keep everything from the next heading onward
    after = afterMarker.slice(nextHeadingMatch.index);
  }

  const newContent = (before.trimEnd() + after).trimEnd() + '\n';
  fs.writeFileSync(CLAUDE_MD_PATH, newContent, 'utf-8');
  console.log('  - Removed cortex block from CLAUDE.md');
}

// ---------------------------------------------------------------------------
// setup uninstall
// ---------------------------------------------------------------------------

export async function uninstallSetup(): Promise<void> {
  console.log('Uninstalling Claude Cortex setup...\n');

  console.log('Hooks:');
  removeHooks();

  console.log('\nCLAUDE.md:');
  removeClaudeMdBlock();

  console.log('\nSetup uninstall complete.');
  console.log('\nNote: Database and logs NOT removed. To clean completely:');
  console.log('  rm -rf ~/.claude-cortex/');
}

// ---------------------------------------------------------------------------
// Full uninstall
// ---------------------------------------------------------------------------

export async function uninstallAll(options?: { keepLogs?: boolean }): Promise<void> {
  console.log('Claude Cortex - Complete Uninstall\n');

  let errors = 0;

  // 1. Service
  console.log('[1/4] Dashboard service...');
  try {
    const { uninstallService } = await import('../service/install.js');
    await uninstallService({ cleanLogs: !options?.keepLogs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! ${msg}`);
    errors++;
  }

  // 2. OpenClaw/Clawdbot hook
  console.log('\n[2/4] OpenClaw/Clawdbot hook...');
  try {
    const { uninstallClawdbotHook } = await import('./clawdbot.js');
    await uninstallClawdbotHook();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! ${msg}`);
    errors++;
  }

  // 3. Hooks
  console.log('\n[3/4] Hooks from settings.json...');
  try {
    removeHooks();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! ${msg}`);
    errors++;
  }

  // 4. CLAUDE.md
  console.log('\n[4/4] CLAUDE.md instructions...');
  try {
    removeClaudeMdBlock();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ! ${msg}`);
    errors++;
  }

  // Summary
  console.log('');
  if (errors === 0) {
    console.log('\nUninstall complete.');
  } else {
    console.log(`\nUninstall completed with ${errors} error(s).`);
  }

  console.log('\nDatabase preserved (your memory data):');
  console.log(`  ~/.claude-cortex/memories.db`);
  console.log('\nTo completely remove ALL data:');
  console.log('  rm -rf ~/.claude-cortex/');
  console.log('\nTo reinstall:');
  console.log('  npx claude-cortex setup');

  if (errors > 0) process.exit(1);
}
