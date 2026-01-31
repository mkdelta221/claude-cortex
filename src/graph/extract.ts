/**
 * Pattern-based entity and triple extraction engine.
 * Extracts entities (files, languages, tools, people, concepts) and
 * relationship triples from memory title + content using pure regex matching.
 */

export type EntityType = 'person' | 'tool' | 'concept' | 'file' | 'language' | 'service' | 'pattern';

export interface ExtractedEntity {
  name: string;
  type: EntityType;
}

export interface ExtractedTriple {
  subject: string;
  predicate: string;
  object: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  triples: ExtractedTriple[];
}

const LANGUAGES = new Set([
  'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'SQL', 'HTML', 'CSS',
  'Ruby', 'Java', 'C++', 'C#', 'Swift', 'Kotlin', 'Scala', 'Elixir',
  'Haskell', 'Lua', 'PHP', 'Perl', 'Shell', 'Bash', 'Zsh',
]);

const TOOLS_AND_SERVICES = new Set([
  'PostgreSQL', 'Redis', 'Docker', 'SQLite', 'Express', 'React', 'Next.js',
  'Node.js', 'npm', 'pnpm', 'yarn', 'git', 'GitHub', 'GitLab', 'Vercel',
  'AWS', 'Azure', 'GCP', 'MongoDB', 'MySQL', 'Prisma', 'Drizzle',
  'Webpack', 'Vite', 'ESLint', 'Prettier', 'Jest', 'Vitest', 'Playwright',
  'Cypress', 'Tailwind', 'MCP',
]);

// Lowercase lookup for case-insensitive matching
const TOOLS_LOWER = new Map<string, string>();
for (const t of TOOLS_AND_SERVICES) {
  TOOLS_LOWER.set(t.toLowerCase(), t);
}

const LANGUAGES_LOWER = new Map<string, string>();
for (const l of LANGUAGES) {
  LANGUAGES_LOWER.set(l.toLowerCase(), l);
}

const PASCAL_CASE_FALSE_POSITIVES = new Set([
  'README', 'TODO', 'IMPORTANT', 'NOTE', 'CREATE', 'INSERT', 'SELECT',
  'UPDATE', 'DELETE', 'WHERE', 'FROM', 'NULL', 'TRUE', 'FALSE', 'THEN',
  'ELSE', 'WHEN', 'CASE', 'INTO', 'TABLE', 'INDEX', 'ALTER', 'DROP',
  'BEGIN', 'COMMIT', 'ROLLBACK',
]);

// Generic words that should never become entities
const STOPWORDS = new Set([
  'project', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'need', 'must', 'it', 'its', 'we', 'our', 'my', 'your',
  'not', 'no', 'yes', 'all', 'any', 'some', 'each', 'every', 'both',
  'new', 'old', 'first', 'last', 'next', 'now', 'then', 'here', 'there',
  'up', 'down', 'out', 'in', 'on', 'off', 'over', 'under', 'more', 'less',
  'also', 'just', 'only', 'very', 'still', 'already', 'always', 'never',
  'added', 'built', 'made', 'set', 'got', 'put', 'run', 'let', 'get',
  'use', 'used', 'using', 'make', 'take', 'keep', 'work', 'call',
  'issue', 'issues', 'fix', 'fixed', 'bug', 'error', 'change', 'changes',
  'feature', 'step', 'phase', 'task', 'item', 'thing', 'things',
  'way', 'part', 'type', 'kind', 'form', 'case', 'point', 'end', 'start',
  'data', 'code', 'file', 'function', 'class', 'method', 'system', 'test',
  'cross', 'visual', 'auto', 'default', 'custom', 'main', 'base',
  'uses', 'with', 'for', 'from', 'after', 'before', 'same', 'key',
  'other', 'into', 'about', 'when', 'where', 'how', 'what', 'which',
  'notes', 'note', 'decisions', 'decision', 'discoveries', 'editing',
  'making', 'matching', 'update', 'updates', 'network', 'design',
  'pattern', 'approach', 'strategy', 'architecture', 'principle',
  'extraction', 'implementation', 'configuration', 'optimization',
]);

const FILE_EXT_RE = /\b[\w./-]+\.(ts|py|js|sql|json|md|tsx|jsx|rs|go|css|html)\b/g;
const DIR_PATH_RE = /\b(src|lib|dist|tests?|scripts?|dashboard)\/[\w./-]+\b/g;
const USERNAME_RE = /@(\w+)/g;
const NAME_SAID_RE = /\b([A-Z][a-z]+)\s+(?:said|mentioned|suggested|noted|asked|proposed)\b/g;
const PASCAL_CASE_RE = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
const BEFORE_KEYWORD_RE = /\b(\w+)\s+(?:database|server|API|framework|library|plugin|extension)\b/g;
const CONCEPT_RE = /\b(?:architecture|pattern|approach|strategy|design)\s+(?:is\s+)?(\w[\w\s-]{0,30}?\w)\b/gi;
const CONCEPT_BEFORE_RE = /\b([\w-]+)\s+(?:architecture|pattern|approach|strategy|design)\b/gi;

export function extractFromMemory(title: string, content: string, category: string): ExtractionResult {
  const text = (title || '') + '\n' + (content || '');
  if (text.trim().length < 2) {
    return { entities: [], triples: [] };
  }

  const entityMap = new Map<string, ExtractedEntity>();

  function addEntity(name: string, type: EntityType): void {
    if (STOPWORDS.has(name.toLowerCase())) return;
    if (name.length < 2) return;
    const key = `${name}::${type}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, { name, type });
    }
  }

  // --- Entity extraction ---

  // Files
  for (const m of text.matchAll(FILE_EXT_RE)) {
    addEntity(m[0], 'file');
  }
  for (const m of text.matchAll(DIR_PATH_RE)) {
    // Skip if already captured as a file with extension
    const val = m[0];
    if (!entityMap.has(`${val}::file`)) {
      addEntity(val, 'file');
    }
  }

  // Languages
  for (const lang of LANGUAGES) {
    // Build a regex that handles special chars like C++ and C#
    const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    if (re.test(text)) {
      addEntity(lang, 'language');
    }
  }

  // Tools/services — exact match
  for (const [lower, canonical] of TOOLS_LOWER) {
    const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (re.test(text)) {
      addEntity(canonical, 'tool');
    }
  }

  // PascalCase words (tools)
  for (const m of text.matchAll(PASCAL_CASE_RE)) {
    const word = m[1];
    if (!PASCAL_CASE_FALSE_POSITIVES.has(word.toUpperCase()) &&
        !LANGUAGES.has(word) &&
        !TOOLS_AND_SERVICES.has(word)) {
      addEntity(word, 'tool');
    }
  }

  // Words before "database", "server", etc.
  for (const m of text.matchAll(BEFORE_KEYWORD_RE)) {
    const word = m[1];
    if (word.length > 1 &&
        !PASCAL_CASE_FALSE_POSITIVES.has(word.toUpperCase()) &&
        !['the', 'a', 'an', 'this', 'that', 'my', 'our', 'its'].includes(word.toLowerCase())) {
      const canonical = TOOLS_LOWER.get(word.toLowerCase());
      addEntity(canonical || word, 'tool');
    }
  }

  // People
  for (const m of text.matchAll(USERNAME_RE)) {
    addEntity(m[1], 'person');
  }
  for (const m of text.matchAll(NAME_SAID_RE)) {
    addEntity(m[1], 'person');
  }

  // Concepts — only hyphenated or multi-word terms (e.g., "microservices architecture")
  for (const m of text.matchAll(CONCEPT_BEFORE_RE)) {
    const concept = m[1].toLowerCase();
    if (concept.length > 4) {
      addEntity(concept, 'concept');
    }
  }
  for (const m of text.matchAll(CONCEPT_RE)) {
    const concept = m[1].trim().toLowerCase();
    if (concept.length > 4) {
      addEntity(concept, 'concept');
    }
  }

  // --- Triple extraction ---

  const triples: ExtractedTriple[] = [];
  const tripleSet = new Set<string>();

  function addTriple(subject: string, predicate: string, object: string): void {
    const key = `${subject}|${predicate}|${object}`;
    if (!tripleSet.has(key)) {
      tripleSet.add(key);
      triples.push({ subject, predicate, object });
      // Ensure referenced entities exist
      ensureEntity(subject);
      ensureEntity(object);
    }
  }

  function ensureEntity(name: string): void {
    if (STOPWORDS.has(name.toLowerCase())) return;
    // Check if any entity with this name exists
    for (const [key] of entityMap) {
      if (key.startsWith(name + '::')) return;
    }
    // Guess type — only promote to entity if it's a known tool/language
    if (TOOLS_LOWER.has(name.toLowerCase())) {
      addEntity(TOOLS_LOWER.get(name.toLowerCase())!, 'tool');
    } else if (LANGUAGES_LOWER.has(name.toLowerCase())) {
      addEntity(LANGUAGES_LOWER.get(name.toLowerCase())!, 'language');
    }
    // Don't create concept entities for unknown words in triples
  }

  function isKnownEntity(name: string): boolean {
    if (STOPWORDS.has(name.toLowerCase())) return false;
    for (const [key] of entityMap) {
      if (key.startsWith(name + '::') || key.toLowerCase().startsWith(name.toLowerCase() + '::')) return true;
    }
    return TOOLS_LOWER.has(name.toLowerCase()) || LANGUAGES_LOWER.has(name.toLowerCase());
  }

  // "using X for Y" → X uses Y
  for (const m of text.matchAll(/\busing\s+(\w+(?:\.\w+)?)\s+for\s+(\w+(?:\s+\w+)?)\b/gi)) {
    addTriple(m[1], 'uses', m[2]);
  }

  // "replaced X with Y" → Y replaces X
  for (const m of text.matchAll(/\breplaced\s+(\w+)\s+with\s+(\w+)\b/gi)) {
    addTriple(m[2], 'replaces', m[1]);
  }

  // "X depends on Y"
  for (const m of text.matchAll(/\b(\w+)\s+depends\s+on\s+(\w+)\b/gi)) {
    addTriple(m[1], 'depends_on', m[2]);
  }

  // "fixed X by Y" — only if X or Y are known entities
  for (const m of text.matchAll(/\bfixed\s+(\w+)\s+by\s+(\w+)\b/gi)) {
    if (isKnownEntity(m[1]) || isKnownEntity(m[2])) {
      addTriple(m[2], 'fixes', m[1]);
    }
  }

  // "chose X over Y"
  for (const m of text.matchAll(/\bchose\s+(\w+)\s+over\s+(\w+)\b/gi)) {
    addTriple('project', 'prefers', m[1]);
    addTriple('project', 'avoids', m[2]);
  }

  // "X configured with Y"
  for (const m of text.matchAll(/\b(\w+)\s+configured\s+with\s+(\w+)\b/gi)) {
    addTriple(m[1], 'configures', m[2]);
  }

  // "implemented X" — only if X is a known entity
  for (const m of text.matchAll(/\bimplemented\s+(\w+)\b/gi)) {
    const word = m[1];
    if (isKnownEntity(word)) {
      addTriple('project', 'implements', word);
    }
  }

  // "X extends Y"
  for (const m of text.matchAll(/\b(\w+)\s+extends\s+(\w+)\b/gi)) {
    addTriple(m[1], 'extends', m[2]);
  }

  return {
    entities: Array.from(entityMap.values()),
    triples,
  };
}
