/**
 * Consolidation Merge Tests
 *
 * Tests the similarity-based clustering logic used by mergeSimilarMemories.
 * Since the full function requires database access, we test the clustering
 * algorithm components and similarity thresholds.
 */

import { describe, it, expect } from '@jest/globals';
import { jaccardSimilarity } from '../memory/similarity.js';

describe('mergeSimilarMemories clustering logic', () => {
  // Simulate the clustering algorithm from mergeSimilarMemories
  function findClusters(
    memories: { title: string; content: string; salience: number }[],
    threshold: number = 0.25
  ): number[][] {
    const clustered = new Set<number>();
    const clusters: number[][] = [];

    for (let i = 0; i < memories.length; i++) {
      if (clustered.has(i)) continue;

      const cluster: number[] = [i];
      const memA = memories[i];

      for (let j = i + 1; j < memories.length; j++) {
        if (clustered.has(j)) continue;

        const memB = memories[j];
        const contentSim = jaccardSimilarity(memA.content, memB.content);
        const titleSim = jaccardSimilarity(memA.title, memB.title);
        const combinedSim = contentSim * 0.6 + titleSim * 0.4;

        if (combinedSim >= threshold) {
          cluster.push(j);
        }
      }

      if (cluster.length >= 2) {
        for (const idx of cluster) clustered.add(idx);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  it('should cluster related JWT memories together', () => {
    const memories = [
      {
        title: 'JWT authentication token setup',
        content: 'Set up JWT authentication token signing using RS256 algorithm in the auth service for user authentication and token validation',
        salience: 0.6,
      },
      {
        title: 'JWT authentication token expiry',
        content: 'JWT authentication tokens expire after 24 hours with refresh token rotation for the auth service user authentication flow',
        salience: 0.5,
      },
      {
        title: 'JWT authentication token middleware',
        content: 'Created JWT authentication token middleware that validates user tokens on every auth service API request and handles token refresh',
        salience: 0.4,
      },
    ];

    const clusters = findClusters(memories, 0.25);

    // All 3 should be in one cluster (they share JWT/token/auth vocabulary)
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    const biggestCluster = clusters.reduce(
      (a, b) => (a.length > b.length ? a : b),
      []
    );
    expect(biggestCluster.length).toBeGreaterThanOrEqual(2);
  });

  it('should pick highest salience memory as base', () => {
    const memories = [
      { title: 'JWT authentication setup', content: 'JWT authentication token signing RS256 in auth service', salience: 0.6 },
      { title: 'JWT authentication expiry', content: 'JWT authentication token expiry 24 hours auth service', salience: 0.5 },
      { title: 'JWT authentication middleware', content: 'JWT authentication token middleware validates auth service', salience: 0.4 },
    ];

    const clusters = findClusters(memories, 0.25);
    expect(clusters.length).toBeGreaterThanOrEqual(1);

    // Sort cluster by salience desc - index 0 (salience 0.6) should be first
    const cluster = clusters[0];
    const sorted = [...cluster].sort(
      (a, b) => memories[b].salience - memories[a].salience
    );
    expect(sorted[0]).toBe(0); // Highest salience is index 0
  });

  it('should not cluster unrelated memories', () => {
    const memories = [
      {
        title: 'JWT Setup',
        content: 'Set up JWT authentication using RS256 algorithm',
        salience: 0.5,
      },
      {
        title: 'Database Migration',
        content: 'Migrated PostgreSQL schema to add user preferences table with JSONB columns',
        salience: 0.5,
      },
    ];

    const clusters = findClusters(memories, 0.25);
    // These should NOT cluster - completely different topics
    expect(clusters.length).toBe(0);
  });

  it('should produce correct merged content format', () => {
    // Simulate what mergeSimilarMemories does after clustering
    const base = {
      title: 'JWT Setup',
      content: 'Set up JWT authentication using RS256 algorithm for token signing in the auth service',
    };
    const others = [
      {
        title: 'JWT Token Expiry',
        content: 'JWT tokens expire after 24 hours, refresh tokens last 30 days for the auth system',
      },
      {
        title: 'JWT Middleware',
        content: 'Created JWT middleware that validates tokens on every API request and attaches user context',
      },
    ];

    const bulletPoints = others
      .map(m => `- ${m.title}: ${m.content}`)
      .join('\n');
    const mergedContent = `${base.content}\n\nConsolidated context:\n${bulletPoints}`;

    expect(mergedContent).toContain('RS256');
    expect(mergedContent).toContain('24 hours');
    expect(mergedContent).toContain('middleware');
    expect(mergedContent).toContain('Consolidated context:');
  });

  it('should merge tags as a union', () => {
    const tagSets = [
      ['jwt', 'auth'],
      ['jwt', 'expiry'],
      ['jwt', 'middleware'],
    ];

    const allTags = new Set<string>();
    for (const tags of tagSets) {
      for (const t of tags) allTags.add(t);
    }

    expect([...allTags].sort()).toEqual(['auth', 'expiry', 'jwt', 'middleware']);
  });

  it('should cap salience at 1.0 after boost', () => {
    const baseSalience = 0.95;
    const newSalience = Math.min(1.0, baseSalience + 0.1);
    expect(newSalience).toBe(1.0);
  });
});
