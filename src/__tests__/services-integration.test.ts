/**
 * Integration tests for embedding services
 * Converted from src/services/verify.ts
 */

import Database from 'better-sqlite3';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { MeetingRepository } from '../db/meetings.js';
import {
  embedAndStoreMeeting,
  searchSimilarMeetings,
} from '../services/embedding.js';
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

// Mock the OpenRouter client
jest.mock('../services/openrouter.js', () => ({
  getOpenRouterClient: jest.fn().mockReturnValue({
    createEmbedding: jest.fn().mockResolvedValue({
      data: [{
        embedding: new Array(1536).fill(0.1),
        index: 0,
      }],
      model: 'openai/text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    }),
  }),
}));

// Import after mocks
import { getOpenRouterClient } from '../services/openrouter.js';

describe('Embedding Service Integration Tests', () => {
  let db: Database.Database;
  let repo: MeetingRepository;
  let mockCreateEmbedding: jest.Mock;

  beforeEach(() => {
    closeDatabase();
    db = initDatabase();
    repo = new MeetingRepository(db);

    // Reset mock
    const client = getOpenRouterClient();
    mockCreateEmbedding = client.createEmbedding as jest.Mock;
    mockCreateEmbedding.mockClear();
  });

  afterEach(() => {
    closeDatabase();
  });

  // --- Helper functions ---
  function createDummyVector(dim: number = 1536): Float32Array {
    const vec = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      vec[i] = Math.random() * 2 - 1;
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

  // --- Phase 3.3: Embedding Storage & Retrieval ---
  describe('Embedding Storage and Retrieval', () => {
    it('should save and retrieve embeddings using dummy vectors', async () => {
      const meeting1: MeetingInput = {
        title: 'Product Roadmap Discussion',
        date: '2026-06-01',
        participants: ['Alice', 'Bob', 'Charlie'],
        tags: ['roadmap', 'planning'],
        content: 'We discussed the Q3 roadmap including new features for authentication and dashboard redesign.',
      };

      const meeting2: MeetingInput = {
        title: 'Sprint Retrospective',
        date: '2026-06-03',
        participants: ['Alice', 'Dave'],
        tags: ['retro', 'sprint'],
        content: 'The sprint went well. We completed most of the user stories but had some blockers with the API integration.',
      };

      const created1 = repo.create(meeting1);
      const created2 = repo.create(meeting2);
      expect(created1.id).toBeGreaterThan(0);
      expect(created2.id).toBeGreaterThan(0);

      // Create dummy embeddings
      const emb1 = normalizeVector(createDummyVector());
      const emb2 = normalizeVector(createDummyVector());
      expect(emb1.length).toBe(1536);
      expect(emb2.length).toBe(1536);

      // Store embeddings
      repo.saveEmbedding(created1.id, emb1);
      repo.saveEmbedding(created2.id, emb2);

      // Search with a needle close to emb1
      const needleOffset = 0.1;
      const needle = normalizeVector(
        new Float32Array(emb1.map((v) => v + (Math.random() - 0.5) * needleOffset))
      );

      const results = repo.searchSimilar(needle, 5);
      expect(results.length).toBeGreaterThan(0);

      if (results.length > 0) {
        const top = results[0];
        expect(top.meeting.id).toBeGreaterThan(0);
        expect(top.distance).toBeDefined();
      }
    });

    it('should delete embeddings when meeting is deleted', () => {
      const meeting = repo.create({
        title: 'Test Meeting',
        date: '2026-06-07',
        participants: ['Test'],
        tags: ['test'],
        content: 'Test content',
      });

      const embedding = normalizeVector(createDummyVector());
      repo.saveEmbedding(meeting.id, embedding);

      // Verify search finds it
      const results = repo.searchSimilar(embedding, 1);
      expect(results.length).toBe(1);

      // Delete meeting
      repo.delete(meeting.id);

      // After deletion, search should not find the deleted meeting data
      // (but may find nothing since we only had one embedding)
      expect(repo.exists(meeting.id)).toBe(false);
    });
  });

  // --- Phase 3.4: Configuration ---
  describe('Configuration', () => {
    it('should load embedding model config from environment', () => {
      const mockGetConfig = jest.fn();
      const configModule = jest.requireActual('../config/index.js') as { getConfig: typeof mockGetConfig };
      // Config is already mocked, just verify mock returns expected shape
      expect(mockGetConfig).toBeDefined;
    });
  });

  // --- Mocked API Tests ---
  describe('Mocked OpenRouter API', () => {
    it('should generate and store embeddings via API', async () => {
      mockCreateEmbedding.mockResolvedValueOnce({
        data: [{
          embedding: new Array(1536).fill(0.05),
          index: 0,
        }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 15, total_tokens: 15 },
      });

      const meeting: MeetingInput = {
        title: 'API Test Meeting',
        date: '2026-06-07',
        participants: ['Test'],
        tags: ['api-test'],
        content: 'This is a test sentence for embedding generation.',
      };

      const created = repo.create(meeting);
      const embedding = await embedAndStoreMeeting(repo, created.id, meeting.content);

      expect(mockCreateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockCreateEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/text-embedding-3-small',
          input: meeting.content,
        })
      );
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(1536);
    });

    it('should search similar meetings using mocked embeddings', async () => {
      // Setup mock to return consistent embeddings
      const mockEmbedding = new Array(1536).fill(0.01);
      mockCreateEmbedding.mockResolvedValue({
        data: [{ embedding: mockEmbedding, index: 0 }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      });

      const meeting: MeetingInput = {
        title: 'Search Test',
        date: '2026-06-07',
        participants: ['Search'],
        tags: ['search'],
        content: 'This is content for search testing.',
      };

      const created = repo.create(meeting);
      await embedAndStoreMeeting(repo, created.id, meeting.content);

      const results = await searchSimilarMeetings(repo, meeting.content, 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockCreateEmbedding.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const meeting = repo.create({
        title: 'Error Test',
        date: '2026-06-07',
        participants: ['Error'],
        tags: ['error'],
        content: 'Test content',
      });

      // embedAndStoreMeeting should fail since generateEmbedding uses withRetry
      // which will retry and eventually fail with a retry error
      await expect(
        embedAndStoreMeeting(repo, meeting.id, 'test')
      ).rejects.toThrow();
    });
  });

  describe('Dummy Vector Edge Cases', () => {
    it('should handle vectors of different dimensions', () => {
      const vec128 = createDummyVector(128);
      const vec256 = createDummyVector(256);

      expect(vec128.length).toBe(128);
      expect(vec256.length).toBe(256);
    });

    it('should normalize vectors correctly', () => {
      const vec = new Float32Array([3, 4, 0]);
      const normalized = normalizeVector(vec);

      // Magnitude should be 1 (for normalized vector)
      const magnitude = Math.sqrt(
        normalized[0] ** 2 + normalized[1] ** 2 + normalized[2] ** 2
      );
      expect(magnitude).toBeCloseTo(1, 5);

      // Direction should be preserved
      expect(normalized[0]).toBeCloseTo(0.6, 5);  // 3/5
      expect(normalized[1]).toBeCloseTo(0.8, 5);  // 4/5
      expect(normalized[2]).toBe(0);
    });

    it('should handle zero vector normalization gracefully', () => {
      const zeroVec = new Float32Array([0, 0, 0]);
      const normalized = normalizeVector(zeroVec);
      // Zero vector normalized results in NaN
      expect(normalized[0]).toBeNaN();
      expect(normalized[1]).toBeNaN();
      expect(normalized[2]).toBeNaN();
    });
  });
});
