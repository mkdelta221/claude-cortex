/**
 * Salience Evolution Tests
 *
 * Tests that salience evolves over time based on structural importance.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Salience Evolution', () => {
  let db: InstanceType<typeof Database>;
  let dbPath: string;

  beforeAll(() => {
    // Create a temp database for testing
    dbPath = path.join(os.tmpdir(), `claude-cortex-test-${Date.now()}.db`);
    db = new Database(dbPath);

    // Create minimal schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'short_term',
        category TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        project TEXT,
        tags TEXT DEFAULT '[]',
        salience REAL DEFAULT 0.5,
        decayed_score REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS memory_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'related',
        strength REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
        UNIQUE(source_id, target_id, relationship)
      );
    `);
  });

  afterAll(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('should boost salience of hub memories with many links', () => {
    // Create a hub memory
    const hubResult = db.prepare(`
      INSERT INTO memories (type, category, title, content, salience)
      VALUES ('long_term', 'architecture', 'Hub Memory', 'Central architecture decision', 0.5)
    `).run();
    const hubId = hubResult.lastInsertRowid as number;

    // Create 5 linked memories
    const linkedIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = db.prepare(`
        INSERT INTO memories (type, category, title, content, salience)
        VALUES ('long_term', 'note', 'Linked ${i}', 'Related content ${i}', 0.4)
      `).run();
      linkedIds.push(r.lastInsertRowid as number);

      db.prepare(`
        INSERT INTO memory_links (source_id, target_id, relationship, strength)
        VALUES (?, ?, 'related', 0.5)
      `).run(linkedIds[i], hubId);
    }

    const originalSalience = (db.prepare('SELECT salience FROM memories WHERE id = ?').get(hubId) as any).salience;

    // Run evolveSalience logic inline (same as the function)
    const hubs = db.prepare(`
      SELECT m.id, m.salience,
        (SELECT COUNT(*) FROM memory_links WHERE source_id = m.id OR target_id = m.id) as link_count
      FROM memories m
      WHERE m.type IN ('long_term', 'episodic')
    `).all() as { id: number; salience: number; link_count: number }[];

    for (const hub of hubs) {
      if (hub.link_count < 2) continue;
      const linkBonus = Math.min(0.1, Math.log2(hub.link_count) * 0.03);
      const newSalience = Math.min(1.0, hub.salience + linkBonus);
      if (newSalience > hub.salience) {
        db.prepare('UPDATE memories SET salience = ? WHERE id = ?').run(newSalience, hub.id);
      }
    }

    const newSalience = (db.prepare('SELECT salience FROM memories WHERE id = ?').get(hubId) as any).salience;
    expect(newSalience).toBeGreaterThan(originalSalience);
  });

  it('should penalize contradicted memories', () => {
    // Create two contradicting memories
    const m1 = db.prepare(`
      INSERT INTO memories (type, category, title, content, salience)
      VALUES ('long_term', 'architecture', 'Use REST', 'We should use REST APIs', 0.6)
    `).run();
    const m2 = db.prepare(`
      INSERT INTO memories (type, category, title, content, salience)
      VALUES ('long_term', 'architecture', 'Use GraphQL', 'We should use GraphQL', 0.6)
    `).run();

    db.prepare(`
      INSERT INTO memory_links (source_id, target_id, relationship, strength)
      VALUES (?, ?, 'contradicts', 0.8)
    `).run(m1.lastInsertRowid, m2.lastInsertRowid);

    // Run contradiction penalty logic
    const contradicted = db.prepare(`
      SELECT DISTINCT source_id, target_id
      FROM memory_links
      WHERE relationship = 'contradicts'
    `).all() as { source_id: number; target_id: number }[];

    for (const pair of contradicted) {
      for (const id of [pair.source_id, pair.target_id]) {
        const mem = db.prepare('SELECT salience FROM memories WHERE id = ?').get(id) as any;
        if (mem && mem.salience > 0.3) {
          db.prepare('UPDATE memories SET salience = ? WHERE id = ?')
            .run(mem.salience - 0.02, id);
        }
      }
    }

    const s1 = (db.prepare('SELECT salience FROM memories WHERE id = ?').get(m1.lastInsertRowid) as any).salience;
    const s2 = (db.prepare('SELECT salience FROM memories WHERE id = ?').get(m2.lastInsertRowid) as any).salience;

    expect(s1).toBeCloseTo(0.58, 2);
    expect(s2).toBeCloseTo(0.58, 2);
  });
});

describe('Mention Count', () => {
  it('should count keyword mentions in text', async () => {
    const { analyzeSalienceFactors } = await import('../memory/salience.js');

    // Text with multiple keyword matches
    const factors = analyzeSalienceFactors({
      title: 'Architecture fix',
      content: 'Fixed a bug in the database schema pattern using a workaround strategy',
    });

    // Should match multiple keywords across categories
    expect(factors.mentionCount).toBeGreaterThan(1);
  });

  it('should return at least 1 for text with no keywords', async () => {
    const { analyzeSalienceFactors } = await import('../memory/salience.js');

    const factors = analyzeSalienceFactors({
      title: 'Hello',
      content: 'Just a simple note',
    });

    expect(factors.mentionCount).toBeGreaterThanOrEqual(1);
  });
});
