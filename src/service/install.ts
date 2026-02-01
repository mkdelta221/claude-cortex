/**
 * Cross-platform service installer for Claude Cortex dashboard auto-start.
 *
 * Supports:
 *  - macOS: LaunchAgent plist
 *  - Linux: systemd user service
 *  - Windows: VBS script in Startup folder
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { launchdPlist, systemdUnit, windowsVbs, type ServiceConfig } from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Platform = 'macos' | 'linux' | 'windows';

function detectPlatform(): Platform {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'win32': return 'windows';
    default: return 'linux';
  }
}

function getServiceConfig(): ServiceConfig {
  const logsDir = path.join(os.homedir(), '.claude-cortex', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return {
    nodePath: process.execPath,
    nodeBinDir: path.dirname(process.execPath),
    entryPoint: path.resolve(__dirname, '..', 'index.js'),
    logsDir,
  };
}

function getServicePath(platform: Platform): string {
  switch (platform) {
    case 'macos':
      return path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.claude-cortex.dashboard.plist');
    case 'linux':
      return path.join(os.homedir(), '.config', 'systemd', 'user', 'claude-cortex-dashboard.service');
    case 'windows': {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'claude-cortex-dashboard.vbs');
    }
  }
}

export async function installService(): Promise<void> {
  const platform = detectPlatform();
  const config = getServiceConfig();
  const servicePath = getServicePath(platform);

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(servicePath), { recursive: true });

  // Generate and write service file
  let content: string;
  switch (platform) {
    case 'macos':
      content = launchdPlist(config);
      break;
    case 'linux':
      content = systemdUnit(config);
      break;
    case 'windows':
      content = windowsVbs(config);
      break;
  }

  fs.writeFileSync(servicePath, content, 'utf-8');
  console.log(`Service file written to: ${servicePath}`);

  // Enable and start the service
  try {
    switch (platform) {
      case 'macos':
        execSync(`launchctl load -w "${servicePath}"`, { stdio: 'inherit' });
        console.log('Service loaded via launchctl.');
        break;
      case 'linux':
        execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
        execSync('systemctl --user enable --now claude-cortex-dashboard.service', { stdio: 'inherit' });
        console.log('Service enabled via systemd.');
        break;
      case 'windows':
        console.log('Service installed. It will start on next login.');
        console.log('To start now, run the VBS script or reboot.');
        break;
    }
  } catch (err: any) {
    console.error(`Failed to enable service: ${err.message}`);
    console.log(`The service file was written to ${servicePath} — you can enable it manually.`);
    return;
  }

  console.log('\nClaude Cortex dashboard will now auto-start on login.');
  console.log(`  API:       http://localhost:3001`);
  console.log(`  Dashboard: http://localhost:3030`);
}

export async function uninstallService(options?: { cleanLogs?: boolean }): Promise<void> {
  const platform = detectPlatform();
  const servicePath = getServicePath(platform);

  if (!fs.existsSync(servicePath)) {
    console.log('  - No service installed.');
    if (options?.cleanLogs) cleanLogsDirectory();
    return;
  }

  try {
    switch (platform) {
      case 'macos':
        execSync(`launchctl unload -w "${servicePath}"`, { stdio: 'inherit' });
        break;
      case 'linux':
        execSync('systemctl --user disable --now claude-cortex-dashboard.service', { stdio: 'inherit' });
        break;
      case 'windows':
        // Just delete the file — no daemon to stop
        break;
    }
  } catch {
    // Service may not be loaded, continue to delete file
  }

  fs.unlinkSync(servicePath);
  console.log(`  - Service removed: ${servicePath}`);

  if (options?.cleanLogs) {
    cleanLogsDirectory();
  }
}

function cleanLogsDirectory(): void {
  const logsDir = path.join(os.homedir(), '.claude-cortex', 'logs');
  if (!fs.existsSync(logsDir)) {
    console.log('  - Logs directory not found');
    return;
  }
  fs.rmSync(logsDir, { recursive: true, force: true });
  console.log(`  - Logs cleaned: ${logsDir}`);
}

export async function serviceStatus(): Promise<void> {
  const platform = detectPlatform();
  const servicePath = getServicePath(platform);
  const installed = fs.existsSync(servicePath);

  console.log(`Platform:  ${platform}`);
  console.log(`Installed: ${installed ? 'yes' : 'no'}`);
  console.log(`Path:      ${servicePath}`);

  if (!installed) return;

  // Check if running
  try {
    switch (platform) {
      case 'macos': {
        const out = execSync('launchctl list com.claude-cortex.dashboard 2>&1', { encoding: 'utf-8' });
        const pidMatch = out.match(/"PID"\s*=\s*(\d+)/);
        console.log(`Running:   ${pidMatch ? `yes (PID ${pidMatch[1]})` : 'no'}`);
        break;
      }
      case 'linux': {
        const out = execSync('systemctl --user is-active claude-cortex-dashboard.service 2>&1', { encoding: 'utf-8' }).trim();
        console.log(`Running:   ${out === 'active' ? 'yes' : 'no'}`);
        break;
      }
      case 'windows':
        console.log('Running:   (check Task Manager for node.exe)');
        break;
    }
  } catch {
    console.log('Running:   no');
  }
}

export async function handleServiceCommand(subcommand: string): Promise<void> {
  switch (subcommand) {
    case 'install':
      await installService();
      break;
    case 'uninstall': {
      const cleanLogs = process.argv.includes('--clean-logs');
      await uninstallService({ cleanLogs });
      break;
    }
    case 'status':
      await serviceStatus();
      break;
    default:
      console.log('Usage: claude-cortex service <install|uninstall|status>');
      process.exit(1);
  }
}
