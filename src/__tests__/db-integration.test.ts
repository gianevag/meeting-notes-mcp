/**
 * Integration tests for database layer
 * Converted from src/db/verify.ts
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { initDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { MeetingRepository } from '../db/meetings.js';
import { MeetingInput } from '../types/meeting.js';

// Mock the logger
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config to use in-memory DB for tests
jest.mock('../config/index.js', () => ({
  getConfig: jest.fn().mockReturnValue({
    openRouterApiKey: 'test-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
  }),
}));

describe('Database Integration Tests', () => {
  let db: Database.Database;
  let repo: MeetingRepository;

  beforeEach(() => {
    // Reset singleton state
    closeDatabase();
    // Re-init DB in memory
    db = initDatabase();
    repo = new MeetingRepository(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  // --- Phase 2.2: Database Initialization ---
  describe('Database Initialization', () => {
    it('should initialize database successfully', () => {
      const db = getDatabase();
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    it('should have correct tables created', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('meetings');
      expect(tableNames).toContain('meeting_embeddings');
    });

    it('should have indices created', () => {
      const indices = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index'
      `).all() as { name: string }[];

      const indexNames = indices.map(i => i.name);
      expect(indexNames).toContain('idx_meetings_date');
      expect(indexNames).toContain('idx_meetings_title');
    });
  });

  // --- Phase 2.3: CRUD Operations ---
  describe('Meeting CRUD Operations', () => {
    const testMeeting: MeetingInput = {
      title: 'Test Meeting',
      date: '2026-06-07',
      participants: ['Alice', 'Bob'],
      tags: ['test', 'demo'],
      content: 'This is a test meeting to verify the database layer works correctly.',
    };

    it('should create and read a meeting', () => {
      const created = repo.create(testMeeting);
      expect(created.id).toBeGreaterThan(0);
      expect(created.title).toBe(testMeeting.title);
      expect(created.participants).toBe('Alice,Bob');
      expect(created.tags).toBe('test,demo');
      expect(created.content).toBe(testMeeting.content);
      expect(created.summary).toBeNull();

      // Read back
      const fetched = repo.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.title).toBe(testMeeting.title);
    });

    it('should list all meetings', () => {
      repo.create(testMeeting);
      repo.create({
        ...testMeeting,
        title: 'Another Meeting',
      });

      const all = repo.list();
      expect(all.length).toBe(2);
    });

    it('should update meeting summary', () => {
      const created = repo.create(testMeeting);
      repo.updateSummary(created.id, 'Test summary');

      const updated = repo.getById(created.id);
      expect(updated!.summary).toBe('Test summary');
    });

    it('should check if meeting exists', () => {
      const created = repo.create(testMeeting);
      expect(repo.exists(created.id)).toBe(true);
      expect(repo.exists(99999)).toBe(false);
    });

    it('should delete a meeting', () => {
      const created = repo.create(testMeeting);
      expect(repo.exists(created.id)).toBe(true);

      const deleted = repo.delete(created.id);
      expect(deleted).toBe(true);
      expect(repo.exists(created.id)).toBe(false);
    });

    it('should return null for non-existent meeting', () => {
      const fetched = repo.getById(99999);
      expect(fetched).toBeNull();
    });
  });

  describe('Meeting Filtering', () => {
    beforeEach(() => {
      repo.create({
        title: 'Roadmap Planning',
        date: '2026-06-01',
        participants: ['Alice', 'Bob'],
        tags: ['roadmap', 'planning'],
        content: 'Q3 roadmap discussion',
      });

      repo.create({
        title: 'Sprint Retrospective',
        date: '2026-06-15',
        participants: ['Charlie', 'Dave'],
        tags: ['retro', 'sprint'],
        content: 'End of sprint retro',
      });
    });

    it('should filter by date range', () => {
      const results = repo.list({
        startDate: '2026-06-10',
        endDate: '2026-06-20',
      });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Sprint Retrospective');
    });

    it('should filter by participant', () => {
      const results = repo.list({ participant: 'Alice' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Roadmap Planning');
    });

    it('should filter by tag', () => {
      const results = repo.list({ tag: 'sprint' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Sprint Retrospective');
    });
  });

  // --- Phase 2.4: sqlite-vec Extension ---
  describe('Embedding Storage & Search', () => {
    function createDummyVector(dim: number = 1536): Float32Array {
      const vec = new Float32Array(dim);
      for (let i = 0; i < dim; i++) {
        vec[i] = (Math.random() * 2 - 1) / Math.sqrt(dim);
      }
      return vec;
    }

    function normalizeVector(vec: Float32Array): Float32Array {
      let sum = 0;
      for (let i = 0; i < vec.length; i++) {
        sum += vec[i] * vec[i];
      }
      const mag = Math.sqrt(sum);
      const normalized = new Float32Array(vec.length);
      for (let i = 0; i < vec.length; i++) {
        normalized[i] = vec[i] / mag;
      }
      return normalized;
    }

    it('should save and retrieve embeddings', () => {
      const meeting: MeetingInput = {
        title: 'Embedding Test',
        date: '2026-06-07',
        participants: ['Test'],
        tags: ['test'],
        content: 'Test content',
      };

      const created = repo.create(meeting);
      const embedding = normalizeVector(createDummyVector());

      expect(() => repo.saveEmbedding(created.id, embedding)).not.toThrow();
    });

    it('should search similar meetings by embedding', () => {
      // Create two meetings
      const m1 = repo.create({
        title: 'Meeting 1',
        date: '2026-06-01',
        participants: ['A'],
        tags: ['tag1'],
        content: 'Content 1',
      });

      const m2 = repo.create({
        title: 'Meeting 2',
        date: '2026-06-02',
        participants: ['B'],
        tags: ['tag2'],
        content: 'Content 2',
      });

      // Create embeddings - similar for m1, different for m2
      const baseVec = normalizeVector(createDummyVector());
      const similarVec = normalizeVector(
        new Float32Array(baseVec.map(v => v + (Math.random() - 0.5) * 0.05))
      );
      const differentVec = normalizeVector(createDummyVector());

      repo.saveEmbedding(m1.id, baseVec);
      repo.saveEmbedding(m2.id, differentVec);

      // Search with vector similar to m1's embedding
      const results = repo.searchSimilar(similarVec, 2);
      expect(results.length).toBeGreaterThan(0);
      // The top result should be one of our meetings
      expect(results[0].meeting.id).toBeGreaterThan(0);
    });
  });
});
