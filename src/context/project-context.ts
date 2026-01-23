/**
 * Project Context Module
 * Automatically detects and manages the active project scope for memory operations.
 *
 * Detection priority:
 * 1. CLAUDE_MEMORY_PROJECT environment variable
 * 2. Extract from process.cwd() (working directory)
 *
 * The "*" sentinel means "global/all projects" (no filtering).
 */

/** Sentinel value meaning "all projects" - no project filtering */
export const GLOBAL_PROJECT_SENTINEL = '*';

/** Currently active project (null = global/no filter) */
let activeProject: string | null = null;

/** How the project was detected */
let projectDetectionSource: 'env' | 'cwd' | 'none' = 'none';

/** Directories to skip when extracting project name from path */
const SKIP_DIRECTORIES = [
  'src', 'lib', 'dist', 'build', 'out',
  'node_modules', '.git', '.next', '.cache',
  'test', 'tests', '__tests__', 'spec',
  'bin', 'scripts', 'config', 'public', 'static',
];

/**
 * Extract project name from a file path.
 * Skips common directory names that don't represent projects.
 */
export function extractProjectFromPath(path: string): string | null {
  if (!path) return null;

  const segments = path.split(/[/\\]/).filter(Boolean);
  if (segments.length === 0) return null;

  // Start from the end and find first non-skipped segment
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (!SKIP_DIRECTORIES.includes(segment.toLowerCase())) {
      // Skip hidden directories (starting with .)
      if (segment.startsWith('.')) continue;
      return segment;
    }
  }

  return null;
}

/**
 * Initialize project context from environment or working directory.
 * Call this once at server startup.
 */
export function initProjectContext(): void {
  // Priority 1: Environment variable (explicit override)
  const envProject = process.env.CLAUDE_MEMORY_PROJECT;
  if (envProject) {
    const trimmed = envProject.trim();
    if (trimmed === GLOBAL_PROJECT_SENTINEL) {
      activeProject = null;
      projectDetectionSource = 'env';
    } else if (trimmed) {
      activeProject = trimmed;
      projectDetectionSource = 'env';
    }
    return;
  }

  // Priority 2: Extract from current working directory
  const cwd = process.cwd();
  const detected = extractProjectFromPath(cwd);
  if (detected) {
    activeProject = detected;
    projectDetectionSource = 'cwd';
  } else {
    activeProject = null;
    projectDetectionSource = 'none';
  }
}

/**
 * Get the currently active project.
 * Returns null if in global scope.
 */
export function getActiveProject(): string | null {
  return activeProject;
}

/**
 * Get how the project was detected.
 */
export function getProjectDetectionSource(): 'env' | 'cwd' | 'none' {
  return projectDetectionSource;
}

/**
 * Resolve the effective project for a tool call.
 *
 * @param explicit - Explicitly provided project parameter (or undefined)
 * @returns The project to use, or null for global scope
 *
 * Logic:
 * - If explicit is "*", return null (global scope)
 * - If explicit is provided, use it
 * - Otherwise, use the auto-detected activeProject
 */
export function resolveProject(explicit: string | undefined): string | null {
  // "*" means global - no project filter
  if (explicit === GLOBAL_PROJECT_SENTINEL) {
    return null;
  }

  // Explicit project provided
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  // Fall back to auto-detected project
  return activeProject;
}

/**
 * Manually set the active project.
 * Use null or "*" for global scope.
 */
export function setActiveProject(project: string | null): void {
  if (project === GLOBAL_PROJECT_SENTINEL) {
    activeProject = null;
  } else {
    activeProject = project;
  }
}

/**
 * Get project context info for display/debugging.
 */
export function getProjectContextInfo(): {
  project: string | null;
  source: 'env' | 'cwd' | 'none';
  isGlobal: boolean;
} {
  return {
    project: activeProject,
    source: projectDetectionSource,
    isGlobal: activeProject === null,
  };
}
