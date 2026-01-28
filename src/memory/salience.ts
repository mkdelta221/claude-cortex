/**
 * Salience Detection System
 *
 * Determines what information is worth remembering, like how the human brain
 * filters important from unimportant information.
 */

import { MemoryCategory, SalienceFactors, MemoryInput } from './types.js';

// Keywords that indicate high-importance content
const ARCHITECTURE_KEYWORDS = [
  'architecture', 'design', 'pattern', 'structure', 'system',
  'database', 'api', 'schema', 'model', 'framework', 'stack',
  'microservice', 'monolith', 'serverless', 'infrastructure'
];

const ERROR_KEYWORDS = [
  'error', 'bug', 'fix', 'issue', 'problem', 'crash', 'fail',
  'exception', 'debug', 'resolve', 'solution', 'workaround'
];

const PREFERENCE_KEYWORDS = [
  'prefer', 'always', 'never', 'style', 'convention', 'standard',
  'like', 'want', 'should', 'must', 'require'
];

const PATTERN_KEYWORDS = [
  'pattern', 'practice', 'approach', 'method', 'technique',
  'implementation', 'strategy', 'algorithm', 'workflow'
];

const EMOTIONAL_MARKERS = [
  'important', 'critical', 'crucial', 'essential', 'key',
  'finally', 'breakthrough', 'eureka', 'aha', 'got it',
  'frustrating', 'annoying', 'tricky', 'remember'
];

// Code reference patterns
const CODE_REFERENCE_PATTERNS = [
  /\b[A-Z][a-zA-Z]*\.[a-zA-Z]+\b/,           // Class.method
  /\b[a-z_][a-zA-Z0-9_]*\.(ts|js|py|go|rs)\b/, // filename.ext
  /`[^`]+`/,                                   // backtick code
  /\b(function|class|interface|type|const|let|var)\s+\w+/i, // declarations
  /\bline\s*\d+\b/i,                          // line references
  /\b(src|lib|app|components?)\/\S+/,          // path references
];

/**
 * Calculate salience score based on content analysis
 */
export function calculateSalience(input: MemoryInput): number {
  const factors = analyzeSalienceFactors(input);
  return computeSalienceScore(factors);
}

/**
 * Analyze content to extract salience factors
 */
export function analyzeSalienceFactors(input: MemoryInput): SalienceFactors {
  const text = `${input.title} ${input.content}`.toLowerCase();

  return {
    explicitRequest: detectExplicitRequest(text),
    isArchitectureDecision: detectKeywords(text, ARCHITECTURE_KEYWORDS),
    isErrorResolution: detectKeywords(text, ERROR_KEYWORDS),
    isCodePattern: detectKeywords(text, PATTERN_KEYWORDS),
    isUserPreference: detectKeywords(text, PREFERENCE_KEYWORDS),
    mentionCount: countMentions(text),
    hasCodeReference: detectCodeReferences(input.content),
    emotionalMarkers: detectKeywords(text, EMOTIONAL_MARKERS),
  };
}

/**
 * Compute final salience score from factors
 */
export function computeSalienceScore(factors: SalienceFactors): number {
  let score = 0.25; // Base score (lowered from 0.4 so trivial notes don't appear important)

  // Weight each factor
  if (factors.explicitRequest) score += 0.5;        // Highest weight
  if (factors.isArchitectureDecision) score += 0.4;
  if (factors.isErrorResolution) score += 0.35;
  if (factors.isCodePattern) score += 0.25;
  if (factors.isUserPreference) score += 0.25;
  if (factors.hasCodeReference) score += 0.15;
  if (factors.emotionalMarkers) score += 0.2;

  // Mention count bonus (diminishing returns)
  if (factors.mentionCount > 1) {
    score += Math.min(0.3, Math.log2(factors.mentionCount) * 0.1);
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

/**
 * Count how many keyword mentions appear in the text
 */
function countMentions(text: string): number {
  const allKeywords = [
    ...ARCHITECTURE_KEYWORDS, ...ERROR_KEYWORDS,
    ...PREFERENCE_KEYWORDS, ...PATTERN_KEYWORDS
  ];
  let count = 0;
  const lower = text.toLowerCase();
  for (const kw of allKeywords) {
    if (lower.includes(kw)) count++;
  }
  return Math.max(1, count);
}

/**
 * Detect if user explicitly requested to remember
 */
function detectExplicitRequest(text: string): boolean {
  const patterns = [
    /\bremember\s+(this|that)\b/i,
    /\bdon'?t\s+forget\b/i,
    /\bkeep\s+(in\s+)?mind\b/i,
    /\bnote\s+(this|that)\b/i,
    /\bsave\s+(this|that)\b/i,
    /\bstore\s+(this|that)\b/i,
    /\bimportant[:\s]/i,
    /\bfor\s+future\s+reference\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect presence of keywords in text
 */
function detectKeywords(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

/**
 * Detect code references in content
 */
function detectCodeReferences(content: string): boolean {
  return CODE_REFERENCE_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Suggest a category based on content analysis
 */
export function suggestCategory(input: MemoryInput): MemoryCategory {
  const text = `${input.title} ${input.content}`.toLowerCase();

  if (detectKeywords(text, ARCHITECTURE_KEYWORDS)) return 'architecture';
  if (detectKeywords(text, ERROR_KEYWORDS)) return 'error';
  if (detectKeywords(text, PREFERENCE_KEYWORDS)) return 'preference';
  if (detectKeywords(text, PATTERN_KEYWORDS)) return 'pattern';

  // Check for TODO patterns
  if (/\b(todo|fixme|hack|xxx)\b/i.test(text)) return 'todo';

  // Check for learning patterns
  if (/\b(learned?|discovered?|realized?|found\s+out)\b/i.test(text)) return 'learning';

  // Check for relationship patterns
  if (/\b(depends?\s+on|requires?|uses?|imports?|extends?)\b/i.test(text)) return 'relationship';

  // Default to note
  return 'note';
}

/**
 * Extract tags from content
 */
export function extractTags(input: MemoryInput): string[] {
  const tags: Set<string> = new Set(input.tags || []);
  const text = `${input.title} ${input.content}`;

  // Extract hashtags
  const hashtagMatches = text.match(/#[a-zA-Z][a-zA-Z0-9_-]*/g);
  if (hashtagMatches) {
    hashtagMatches.forEach(tag => tags.add(tag.slice(1).toLowerCase()));
  }

  // Extract common tech terms
  const techTerms = [
    'react', 'vue', 'angular', 'node', 'python', 'typescript', 'javascript',
    'api', 'database', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'git', 'ci/cd',
    'testing', 'auth', 'security', 'performance', 'caching'
  ];

  const lowerText = text.toLowerCase();
  techTerms.forEach(term => {
    if (lowerText.includes(term)) {
      tags.add(term);
    }
  });

  return Array.from(tags).slice(0, 10); // Limit to 10 tags
}

/**
 * Analyze if content is worth remembering at all
 */
export function isWorthRemembering(input: MemoryInput, minSalience: number = 0.3): boolean {
  const salience = calculateSalience(input);
  return salience >= minSalience;
}

/**
 * Get a human-readable explanation of why something was considered important
 */
export function explainSalience(factors: SalienceFactors): string {
  const reasons: string[] = [];

  if (factors.explicitRequest) reasons.push('explicitly requested to remember');
  if (factors.isArchitectureDecision) reasons.push('architecture decision');
  if (factors.isErrorResolution) reasons.push('error resolution');
  if (factors.isCodePattern) reasons.push('code pattern');
  if (factors.isUserPreference) reasons.push('user preference');
  if (factors.hasCodeReference) reasons.push('references specific code');
  if (factors.emotionalMarkers) reasons.push('marked as important');
  if (factors.mentionCount > 1) reasons.push(`mentioned ${factors.mentionCount} times`);

  if (reasons.length === 0) return 'general note';
  return reasons.join(', ');
}
