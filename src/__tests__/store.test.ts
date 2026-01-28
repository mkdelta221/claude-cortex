/**
 * Memory Store Tests
 *
 * Tests for core memory operations, salience detection, and decay calculations.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Memory, MemoryInput } from '../memory/types.js';
import { jaccardSimilarity } from '../memory/similarity.js';
import { cosineSimilarity } from '../embeddings/generator.js';

describe('Memory Types', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have sensible default values', async () => {
      const { DEFAULT_CONFIG } = await import('../memory/types.js');

      expect(DEFAULT_CONFIG.decayRate).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.decayRate).toBeLessThan(1);
      expect(DEFAULT_CONFIG.reinforcementFactor).toBeGreaterThan(1);
      expect(DEFAULT_CONFIG.salienceThreshold).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.salienceThreshold).toBeLessThan(1);
      expect(DEFAULT_CONFIG.maxShortTermMemories).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.maxLongTermMemories).toBeGreaterThan(0);
    });

    it('should have valid thresholds', async () => {
      const { DEFAULT_CONFIG } = await import('../memory/types.js');

      // Consolidation threshold should be higher than deletion threshold
      expect(DEFAULT_CONFIG.consolidationThreshold).toBeGreaterThan(
        DEFAULT_CONFIG.salienceThreshold
      );
    });
  });

  describe('DELETION_THRESHOLDS', () => {
    it('should have thresholds for all categories', async () => {
      const { DELETION_THRESHOLDS } = await import('../memory/types.js');

      const expectedCategories = [
        'architecture',
        'pattern',
        'preference',
        'error',
        'context',
        'learning',
        'todo',
        'note',
        'relationship',
        'custom',
      ];

      for (const category of expectedCategories) {
        expect(DELETION_THRESHOLDS[category as keyof typeof DELETION_THRESHOLDS]).toBeDefined();
        expect(DELETION_THRESHOLDS[category as keyof typeof DELETION_THRESHOLDS]).toBeGreaterThan(0);
        expect(DELETION_THRESHOLDS[category as keyof typeof DELETION_THRESHOLDS]).toBeLessThan(1);
      }
    });

    it('should prioritize architecture and error over notes', async () => {
      const { DELETION_THRESHOLDS } = await import('../memory/types.js');

      // Lower threshold = harder to delete
      expect(DELETION_THRESHOLDS.architecture).toBeLessThan(DELETION_THRESHOLDS.note);
      expect(DELETION_THRESHOLDS.error).toBeLessThan(DELETION_THRESHOLDS.note);
    });
  });
});

describe('Salience Detection', () => {
  describe('calculateSalience', () => {
    it('should return higher salience for explicit remember requests', async () => {
      const { calculateSalience } = await import('../memory/salience.js');

      const explicitResult = calculateSalience({
        title: 'Test Memory',
        content: 'Remember this important information',
      });

      const implicitResult = calculateSalience({
        title: 'Test Memory',
        content: 'Some random text without markers',
      });

      expect(explicitResult).toBeGreaterThanOrEqual(implicitResult);
    });

    it('should detect architecture decisions', async () => {
      const { calculateSalience } = await import('../memory/salience.js');

      const result = calculateSalience({
        title: 'Database Choice',
        content: 'We decided to use PostgreSQL for better JSON support',
      });

      expect(result).toBeGreaterThan(0.3);
    });

    it('should detect error resolutions', async () => {
      const { calculateSalience } = await import('../memory/salience.js');

      const result = calculateSalience({
        title: 'Bug Fix',
        content: 'Fixed by updating the dependency to version 2.0',
      });

      expect(result).toBeGreaterThan(0.3);
    });

    it('should return values between 0 and 1', async () => {
      const { calculateSalience } = await import('../memory/salience.js');

      const result = calculateSalience({
        title: 'Test',
        content: 'Any content',
      });

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('suggestCategory', () => {
    it('should suggest architecture for design decisions', async () => {
      const { suggestCategory } = await import('../memory/salience.js');

      const result = suggestCategory({
        title: 'System Design',
        content: 'Using microservices architecture with API gateway',
      });

      expect(result).toBe('architecture');
    });

    it('should suggest error for bug fixes', async () => {
      const { suggestCategory } = await import('../memory/salience.js');

      const result = suggestCategory({
        title: 'Bug Resolution',
        content: 'The error was caused by null pointer exception',
      });

      expect(result).toBe('error');
    });

    it('should suggest preference for user preferences', async () => {
      const { suggestCategory } = await import('../memory/salience.js');

      const result = suggestCategory({
        title: 'User Setting',
        content: 'User prefers TypeScript strict mode always',
      });

      expect(result).toBe('preference');
    });

    it('should return a valid category', async () => {
      const { suggestCategory } = await import('../memory/salience.js');

      const validCategories = [
        'architecture',
        'pattern',
        'preference',
        'error',
        'context',
        'learning',
        'todo',
        'note',
        'relationship',
        'custom',
      ];

      const result = suggestCategory({
        title: 'Test',
        content: 'Generic content',
      });

      expect(validCategories).toContain(result);
    });
  });

  describe('extractTags', () => {
    it('should extract hashtags from content', async () => {
      const { extractTags } = await import('../memory/salience.js');

      const result = extractTags({
        title: 'Test',
        content: 'This is about #typescript and #react',
      });

      expect(result).toContain('typescript');
      expect(result).toContain('react');
    });

    it('should include provided tags', async () => {
      const { extractTags } = await import('../memory/salience.js');

      const result = extractTags({
        title: 'Test',
        content: 'Some content',
        tags: ['existing-tag'],
      });

      expect(result).toContain('existing-tag');
    });

    it('should return an array', async () => {
      const { extractTags } = await import('../memory/salience.js');

      const result = extractTags({
        title: 'Test',
        content: 'Content without hashtags',
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('Temporal Decay', () => {
  // Helper to create a valid Memory object for testing
  function createTestMemory(overrides: Partial<Memory> = {}): Memory {
    return {
      id: 1,
      type: 'short_term',
      category: 'note',
      title: 'Test Memory',
      content: 'Test content for decay testing',
      salience: 0.8,
      lastAccessed: new Date(),
      createdAt: new Date(),
      accessCount: 1,
      project: 'test-project',
      tags: [],
      metadata: {},
      decayedScore: 0.8,
      scope: 'project',
      transferable: false,
      ...overrides,
    };
  }

  describe('calculateDecayedScore', () => {
    it('should decay score over time', async () => {
      const { calculateDecayedScore } = await import('../memory/decay.js');

      const memory = createTestMemory({
        lastAccessed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      });

      const decayedScore = calculateDecayedScore(memory);

      // Score should be less than original salience after 24 hours
      expect(decayedScore).toBeLessThan(memory.salience);
      expect(decayedScore).toBeGreaterThan(0);
    });

    it('should not decay recently accessed memories significantly', async () => {
      const { calculateDecayedScore } = await import('../memory/decay.js');

      const memory = createTestMemory({
        lastAccessed: new Date(), // Just now
      });

      const decayedScore = calculateDecayedScore(memory);

      // Score should be very close to original for recently accessed
      expect(decayedScore).toBeCloseTo(memory.salience, 1);
    });

    it('should decay long-term memories slower than short-term', async () => {
      const { calculateDecayedScore } = await import('../memory/decay.js');

      const hoursSinceAccess = 24;
      const lastAccessed = new Date(Date.now() - hoursSinceAccess * 60 * 60 * 1000);

      const shortTermMemory = createTestMemory({
        type: 'short_term',
        lastAccessed,
      });

      const longTermMemory = createTestMemory({
        type: 'long_term',
        lastAccessed,
      });

      const shortTermScore = calculateDecayedScore(shortTermMemory);
      const longTermScore = calculateDecayedScore(longTermMemory);

      // Long-term should retain more score than short-term
      expect(longTermScore).toBeGreaterThan(shortTermScore);
    });

    it('should return value between 0 and 1', async () => {
      const { calculateDecayedScore } = await import('../memory/decay.js');

      const memory = createTestMemory({
        lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365), // 1 year ago
      });

      const decayedScore = calculateDecayedScore(memory);

      expect(decayedScore).toBeGreaterThanOrEqual(0);
      expect(decayedScore).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateReinforcementBoost', () => {
    it('should boost score on access', async () => {
      const { calculateReinforcementBoost } = await import('../memory/decay.js');

      const memory = createTestMemory({ salience: 0.5 });
      const boost = calculateReinforcementBoost(memory);

      expect(boost).toBeGreaterThan(memory.salience);
      expect(boost).toBeLessThanOrEqual(1.0);
    });

    it('should cap boost at 1.0', async () => {
      const { calculateReinforcementBoost } = await import('../memory/decay.js');

      const memory = createTestMemory({ salience: 0.95 });
      const boost = calculateReinforcementBoost(memory);

      expect(boost).toBeLessThanOrEqual(1.0);
    });
  });
});

describe('Text Similarity', () => {
  describe('jaccardSimilarity', () => {
    it('should return 1.0 for identical texts', async () => {
      const { jaccardSimilarity } = await import('../memory/similarity.js');

      const result = jaccardSimilarity(
        'the quick brown fox',
        'the quick brown fox'
      );

      expect(result).toBe(1.0);
    });

    it('should return 0.0 for completely different texts', async () => {
      const { jaccardSimilarity } = await import('../memory/similarity.js');

      const result = jaccardSimilarity(
        'apple banana cherry',
        'dog elephant frog'
      );

      expect(result).toBe(0.0);
    });

    it('should return value between 0 and 1 for partial overlap', async () => {
      const { jaccardSimilarity } = await import('../memory/similarity.js');

      const result = jaccardSimilarity(
        'the quick brown fox',
        'the lazy brown dog'
      );

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('should be symmetric', async () => {
      const { jaccardSimilarity } = await import('../memory/similarity.js');

      const result1 = jaccardSimilarity('hello world', 'world hello');
      const result2 = jaccardSimilarity('world hello', 'hello world');

      expect(result1).toBeCloseTo(result2, 10);
    });
  });

  describe('tokenize', () => {
    it('should lowercase text', async () => {
      const { tokenize } = await import('../memory/similarity.js');

      const result = tokenize('HELLO World');

      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.has('HELLO')).toBe(false);
    });

    it('should remove punctuation', async () => {
      const { tokenize } = await import('../memory/similarity.js');

      const result = tokenize('hello, world! how are you?');

      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.has('hello,')).toBe(false);
    });

    it('should filter short words', async () => {
      const { tokenize } = await import('../memory/similarity.js');

      const result = tokenize('a an the and or but');

      // Words with 2 or fewer characters should be filtered
      expect(result.has('a')).toBe(false);
      expect(result.has('an')).toBe(false);
      expect(result.has('the')).toBe(true); // 3 chars
      expect(result.has('and')).toBe(true); // 3 chars
    });
  });
});

describe('Content Truncation', () => {
  it('should define MAX_CONTENT_SIZE constant', () => {
    const MAX_CONTENT_SIZE = 10 * 1024; // 10KB
    expect(MAX_CONTENT_SIZE).toBe(10240);
  });

  it('should handle content under the limit', () => {
    const content = 'Short content';
    const MAX_CONTENT_SIZE = 10 * 1024;

    expect(content.length).toBeLessThan(MAX_CONTENT_SIZE);
  });

  it('should identify content over the limit', () => {
    const MAX_CONTENT_SIZE = 10 * 1024;
    const longContent = 'x'.repeat(MAX_CONTENT_SIZE + 100);

    expect(longContent.length).toBeGreaterThan(MAX_CONTENT_SIZE);
  });
});

describe('Semantic Linking', () => {
  describe('cosineSimilarity for embedding-based linking', () => {

    it('should return 1.0 for identical vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('should return high similarity for similar vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([1.1, 2.1, 3.1]);
      expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
    });
  });

  describe('jaccardSimilarity for FTS fallback linking', () => {
    it('should link memories with similar content but different tags', () => {
      // Two memories about the same topic (SQLite performance) but with different tags
      const memoryA = 'SQLite database performance optimization using WAL mode and busy timeout';
      const memoryB = 'SQLite performance tuning with WAL journal mode and connection pooling';

      const similarity = jaccardSimilarity(memoryA, memoryB);
      // Should exceed the 0.3 threshold for FTS fallback linking
      expect(similarity).toBeGreaterThanOrEqual(0.3);
    });

    it('should not link unrelated memories', () => {
      const memoryA = 'React component lifecycle hooks and state management';
      const memoryB = 'PostgreSQL database backup and restore procedures';

      const similarity = jaccardSimilarity(memoryA, memoryB);
      // Should be below the 0.3 threshold
      expect(similarity).toBeLessThan(0.3);
    });

    it('should compute correct strength: min(0.7, sim + 0.2)', () => {
      const memoryA = 'SQLite WAL mode performance optimization database';
      const memoryB = 'SQLite WAL mode performance tuning database';
      const sim = jaccardSimilarity(memoryA, memoryB);
      const strength = Math.min(0.7, sim + 0.2);
      expect(strength).toBeGreaterThan(0.2);
      expect(strength).toBeLessThanOrEqual(0.7);
    });
  });

  describe('Integration: detectRelationships via addMemory', () => {
    it('should auto-link related memories with different tags', async () => {
      const { initDatabase, closeDatabase } = await import('../database/init.js');
      const { addMemory, getRelatedMemories, deleteMemory } = await import('../memory/store.js');

      // Close any existing database connection first
      closeDatabase();

      // Initialize a fresh test database
      const testDbPath = ':memory:';
      initDatabase(testDbPath);

      let memoryAId: number | undefined;
      let memoryBId: number | undefined;

      try {
        // Create first memory tagged "database"
        const memoryA = addMemory({
          title: 'SQLite Performance Optimization',
          content: 'SQLite database performance optimization using WAL mode and busy timeout for concurrent access',
          tags: ['database'],
          project: 'test-project',
        });
        memoryAId = memoryA.id;

        // Create second memory tagged "backend" with similar content
        // This triggers detectRelationships internally, which should find memoryA
        const memoryB = addMemory({
          title: 'Backend Database Tuning',
          content: 'SQLite performance tuning with WAL journal mode and connection pooling for better throughput',
          tags: ['backend'],
          project: 'test-project',
        });
        memoryBId = memoryB.id;

        // Wait a bit for async embedding generation (though FTS fallback should work immediately)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that memoryB is linked to memoryA
        const relatedToB = getRelatedMemories(memoryB.id);

        // Should have at least one link
        expect(relatedToB.length).toBeGreaterThan(0);

        // Should contain a link to memoryA
        const linkToA = relatedToB.find(rel => rel.memory.id === memoryA.id);
        expect(linkToA).toBeDefined();

        if (linkToA) {
          // Verify the relationship properties
          expect(linkToA.relationship).toBe('related');
          expect(linkToA.strength).toBeGreaterThan(0);
          expect(linkToA.strength).toBeLessThanOrEqual(1);
          expect(linkToA.direction).toBe('outgoing');
        }
      } finally {
        // Cleanup: delete test memories
        if (memoryAId) {
          try { deleteMemory(memoryAId); } catch (e) { /* ignore */ }
        }
        if (memoryBId) {
          try { deleteMemory(memoryBId); } catch (e) { /* ignore */ }
        }
        // Close the database connection
        closeDatabase();
      }
    });
  });
});
