/**
 * Tests for MCP Server Foundation (Phase 5)
 *
 * Verifies:
 *  - Server initializes and connects via InMemoryTransport
 *  - All 6 tools are registered and listed correctly
 *  - Tool input validation works via Zod schemas
 *  - Health check / ping responds
 *  - Each tool handler executes correctly (with mocked external services)
 */

import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { MeetingRepository } from '../db/meetings.js';

// ── Mocks ─────────────────────────────────────────────────────────

jest.mock('../config/index.js', () => ({
  getConfig: jest.fn().mockReturnValue({
    openRouterApiKey: 'test-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
    mcpUsername: undefined,
    mcpPassword: undefined,
    jwtSecret: undefined,
  }),
}));

jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../services/openrouter.js', () => ({
  getOpenRouterClient: jest.fn().mockReturnValue({
    createEmbedding: jest.fn().mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
      model: 'openai/text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    }),
    createChatCompletion: jest.fn().mockResolvedValue({
      id: 'test-id',
      object: 'chat.completion',
      created: 1234567890,
      model: 'anthropic/claude-sonnet-4-20250514',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Test LLM response' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  }),
  resetOpenRouterClient: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────

async function setupClientServer() {
  // createServer already registers all tools
  const server = createServer();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client };
}

async function cleanup({
  server,
  client,
}: {
  server: ReturnType<typeof createServer>;
  client?: Client;
}) {
  if (client) await client.close();
  await server.close();
}

// ── Test Suite ────────────────────────────────────────────────────

describe('MCP Server Foundation (Phase 5)', () => {
  let db: Database.Database;
  let repo: MeetingRepository;
  let server: ReturnType<typeof createServer>;
  let client: Client;

  beforeEach(async () => {
    closeDatabase();
    db = initDatabase();
    repo = new MeetingRepository(db);

    const pair = await setupClientServer();
    server = pair.server;
    client = pair.client;
  });

  afterEach(async () => {
    await cleanup({ server, client });
    closeDatabase();
  });

  // ── 5.1 Server Initialization ─────────────────────────────────
  describe('Server Initialization', () => {
    it('should create a server without errors', () => {
      const s = createServer();
      expect(s).toBeDefined();
      // Clean up extra server
      s.close();
    });

    it('should connect to InMemoryTransport and complete initialization', async () => {
      const version = client.getServerVersion();
      expect(version).toEqual({
        name: 'meeting-notes-mcp',
        version: '1.0.0',
      });
    });

    it('should advertise tools capability', async () => {
      const caps = client.getServerCapabilities();
      expect(caps).toBeDefined();
      expect(caps?.tools).toBeDefined();
    });
  });

  // ── 5.4 Health Check / Ping ───────────────────────────────────
  describe('Health Check / Ping', () => {
    it('should respond to ping requests', async () => {
      const result = await client.ping();
      expect(result).toBeDefined();
    });
  });

  // ── 5.2 & 5.3 Tool Registration ───────────────────────────────
  describe('Tool Registration', () => {
    it('should list all 6 tools', async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(6);

      const names = result.tools.map((t: { name: string }) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'add_meeting',
          'get_meeting',
          'list_meetings',
          'search_meetings',
          'summarize_meeting',
          'ask_meetings',
        ])
      );
    });

    it('should include descriptions for all tools', async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
      }
    });

    it('should include input schemas for all tools', async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  // ── add_meeting ────────────────────────────────────────────────
  describe('add_meeting tool', () => {
    it('should create a meeting and return it with an ID', async () => {
      const result = (await client.callTool({
        name: 'add_meeting',
        arguments: {
          title: 'Roadmap Planning',
          date: '2026-06-08',
          participants: ['Alice', 'Bob'],
          tags: ['roadmap', 'planning'],
          content: 'We discussed the Q3 roadmap including new features for authentication and dashboard redesign.',
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.success).toBe(true);
      expect(parsed.meeting.id).toBeGreaterThan(0);
      expect(parsed.meeting.title).toBe('Roadmap Planning');
    });

    it('should reject invalid input (missing required fields)', async () => {
      const result = (await client.callTool({
        name: 'add_meeting',
        arguments: { title: 'Incomplete' },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Input validation error');
    });

    it('should reject invalid date format', async () => {
      const result = (await client.callTool({
        name: 'add_meeting',
        arguments: {
          title: 'Bad Date',
          date: '06-08-2026',
          participants: ['Alice'],
          tags: [],
          content: 'This is a test meeting content that is long enough.',
        },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Input validation error');
    });
  });

  // ── get_meeting ────────────────────────────────────────────────
  describe('get_meeting tool', () => {
    it('should retrieve a meeting by ID', async () => {
      const created = repo.create({
        title: 'Sprint Review',
        date: '2026-06-01',
        participants: ['Charlie', 'Dave'],
        tags: ['sprint'],
        content: 'Reviewed sprint progress and identified blockers.',
      });

      const result = (await client.callTool({
        name: 'get_meeting',
        arguments: { id: created.id },
      })) as any;

      expect(result.isError).toBeFalsy();
      const meeting = JSON.parse(result.content[0].text);
      expect(meeting.id).toBe(created.id);
      expect(meeting.title).toBe('Sprint Review');
    });

    it('should return not-found message for invalid ID', async () => {
      const result = (await client.callTool({
        name: 'get_meeting',
        arguments: { id: 99999 },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('not found');
    });

    it('should reject non-positive ID', async () => {
      const result = (await client.callTool({
        name: 'get_meeting',
        arguments: { id: -1 },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Input validation error');
    });
  });

  // ── list_meetings ──────────────────────────────────────────────
  describe('list_meetings tool', () => {
    beforeEach(() => {
      repo.create({
        title: 'Roadmap Planning',
        date: '2026-06-01',
        participants: ['Alice', 'Bob'],
        tags: ['roadmap'],
        content: 'Q3 roadmap discussion.',
      });
      repo.create({
        title: 'Sprint Retrospective',
        date: '2026-06-15',
        participants: ['Charlie', 'Dave'],
        tags: ['retro'],
        content: 'End of sprint retro.',
      });
    });

    it('should list all meetings when no filters provided', async () => {
      const result = (await client.callTool({
        name: 'list_meetings',
        arguments: {},
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
    });

    it('should filter by date range', async () => {
      const result = (await client.callTool({
        name: 'list_meetings',
        arguments: {
          startDate: '2026-06-10',
          endDate: '2026-06-20',
        },
      })) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.meetings[0].title).toBe('Sprint Retrospective');
    });

    it('should filter by participant', async () => {
      const result = (await client.callTool({
        name: 'list_meetings',
        arguments: { participant: 'Alice' },
      })) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.meetings[0].title).toBe('Roadmap Planning');
    });

    it('should filter by tag', async () => {
      const result = (await client.callTool({
        name: 'list_meetings',
        arguments: { tag: 'retro' },
      })) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.meetings[0].title).toBe('Sprint Retrospective');
    });

    it('should reject invalid date range', async () => {
      const result = (await client.callTool({
        name: 'list_meetings',
        arguments: {
          startDate: '2026-06-20',
          endDate: '2026-06-01',
        },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Input validation error');
    });
  });

  // ── search_meetings ────────────────────────────────────────────
  describe('search_meetings tool', () => {
    it('should find meetings by semantic similarity', async () => {
      // Add a meeting (embedding is mocked to be identical for all calls)
      await client.callTool({
        name: 'add_meeting',
        arguments: {
          title: 'Product Roadmap',
          date: '2026-06-01',
          participants: ['Alice'],
          tags: ['roadmap'],
          content: 'We discussed the Q3 roadmap including new features.',
        },
      });

      const result = (await client.callTool({
        name: 'search_meetings',
        arguments: {
          query: 'roadmap features',
          limit: 5,
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBeGreaterThan(0);
      expect(parsed.results[0].title).toBe('Product Roadmap');
    });

    it('should reject empty query', async () => {
      const result = (await client.callTool({
        name: 'search_meetings',
        arguments: { query: '' },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Input validation error');
    });
  });

  // ── summarize_meeting ──────────────────────────────────────────
  describe('summarize_meeting tool', () => {
    it('should generate a summary and update the meeting', async () => {
      const created = repo.create({
        title: 'Design Review',
        date: '2026-06-05',
        participants: ['Eve', 'Frank'],
        tags: ['design'],
        content: 'Reviewed the new dashboard design mockups and approved the color scheme.',
      });

      const result = (await client.callTool({
        name: 'summarize_meeting',
        arguments: { id: created.id, style: 'brief' },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.meetingId).toBe(created.id);
      expect(parsed.summary).toBe('Test LLM response');
      expect(parsed.style).toBe('brief');

      // Verify DB was updated
      const updated = repo.getById(created.id);
      expect(updated?.summary).toBe('Test LLM response');
    });

    it('should return error for non-existent meeting', async () => {
      const result = (await client.callTool({
        name: 'summarize_meeting',
        arguments: { id: 99999, style: 'detailed' },
      })) as any;

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('not found');
    });
  });

  // ── ask_meetings ───────────────────────────────────────────────
  describe('ask_meetings tool', () => {
    it('should answer a question using RAG', async () => {
      // Add a meeting
      await client.callTool({
        name: 'add_meeting',
        arguments: {
          title: 'Pricing Discussion',
          date: '2026-06-03',
          participants: ['Alice', 'Bob'],
          tags: ['pricing'],
          content: 'We decided to increase the price by 10% starting next quarter.',
        },
      });

      const result = (await client.callTool({
        name: 'ask_meetings',
        arguments: {
          question: 'What did we decide about pricing?',
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('Test LLM response');
    });

    it('should handle no relevant meetings gracefully', async () => {
      const result = (await client.callTool({
        name: 'ask_meetings',
        arguments: {
          question: 'What happened in the Mars colony meeting?',
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('No relevant meetings found');
    });
  });
});
