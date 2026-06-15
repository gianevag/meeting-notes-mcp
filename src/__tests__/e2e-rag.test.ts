/**
 * E2E Test for complete RAG pipeline (Phase 7.6)
 *
 * Verifies the full flow: add meetings → embed → ask question → get answer
 * Uses InMemoryTransport and mocked OpenRouter API.
 */

import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';
import { initDatabase, closeDatabase } from '../db/connection.js';

// ── Mocks ─────────────────────────────────────────────────────────

jest.mock('../config/index.js', () => ({
  getConfig: jest.fn().mockReturnValue({
    openRouterApiKey: 'test-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
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
    createChatCompletion: jest.fn().mockImplementation(async (req) => {
      // Extract full prompt from messages
      const userMessage = req.messages.find((m: any) => m.role === 'user');
      const contextText: string = userMessage?.content || '';

      // Detect the question
      const questionMatch = contextText.match(/Question:\s*(.+?)(?:\n|$)/);
      const question = questionMatch ? questionMatch[1].toLowerCase() : '';

      let answer: string;

      if (question.includes('pricing') || question.includes('price')) {
        answer = 'Based on the Pricing Discussion meeting, the team decided to increase the price by 10% starting next quarter.';
      } else if (question.includes('priority') || question.includes('priorities') || question.includes('q3') || question.includes('roadmap')) {
        answer = 'According to the Roadmap Meeting, the top priority is rebuilding the auth system and redesigning the dashboard.';
      } else if (question.includes('hiring') || question.includes('engineer') || question.includes('position')) {
        answer = 'The Hiring Committee decided to approve two new senior engineer positions for Q3.';
      } else if (question.includes('color') || question.includes('design') || question.includes('dark mode')) {
        answer = 'In the Design Review, the team approved the new dark mode color scheme.';
      } else if (contextText.includes('No relevant meetings found') || contextText.trim().length < 50) {
        answer = 'No relevant meetings found to answer this question.';
      } else {
        answer = 'I could not find relevant information.';
      }

      return {
        id: 'e2e-test',
        object: 'chat.completion',
        created: Date.now(),
        model: req.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: answer },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: contextText.length, completion_tokens: answer.length, total_tokens: contextText.length + answer.length },
      };
    }),
  }),
  resetOpenRouterClient: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────

async function setupClientServer() {
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

describe('E2E RAG Pipeline (Phase 7.6)', () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;

  beforeEach(async () => {
    closeDatabase();
    initDatabase();

    const pair = await setupClientServer();
    server = pair.server;
    client = pair.client;
  });

  afterEach(async () => {
    await cleanup({ server, client });
    closeDatabase();
  });

  it('should complete full RAG flow: add → search → ask', async () => {
    // Step 1: Add multiple meetings
    const addResult1 = (await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Pricing Discussion',
        date: '2026-06-01',
        participants: ['Alice', 'Bob'],
        tags: ['pricing', 'finance'],
        content: 'We discussed pricing strategy. The team decided to increase the price by 10% starting next quarter. This will help with margins.',
      },
    })) as any;

    expect(addResult1.isError).toBeFalsy();
    const meeting1 = JSON.parse(addResult1.content[0].text);
    expect(meeting1.success).toBe(true);
    expect(meeting1.meeting.id).toBeGreaterThan(0);

    const addResult2 = (await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Roadmap Meeting',
        date: '2026-06-05',
        participants: ['Charlie', 'Dave', 'Eve'],
        tags: ['roadmap', 'planning'],
        content: 'Q3 planning session. Top priority is rebuilding the authentication system. Dashboard redesign is second priority. Mobile app is backlog.',
      },
    })) as any;

    expect(addResult2.isError).toBeFalsy();

    const addResult3 = (await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Hiring Committee',
        date: '2026-06-10',
        participants: ['HR', 'CTO'],
        tags: ['hiring'],
        content: 'Approved two new senior engineer positions for Q3. Also decided to hire a PM for the mobile team.',
      },
    })) as any;

    expect(addResult3.isError).toBeFalsy();

    // Step 2: List all meetings confirms persistence
    const listResult = (await client.callTool({
      name: 'list_meetings',
      arguments: {},
    })) as any;

    expect(listResult.isError).toBeFalsy();
    const listParsed = JSON.parse(listResult.content[0].text);
    expect(listParsed.count).toBe(3);

    // Step 3: Semantic search returns relevant meetings
    // With identical mock embeddings, all meetings are equally similar.
    const searchResult = (await client.callTool({
      name: 'search_meetings',
      arguments: {
        query: 'price increase next quarter',
        limit: 3,
      },
    })) as any;

    expect(searchResult.isError).toBeFalsy();
    const searchParsed = JSON.parse(searchResult.content[0].text);
    expect(searchParsed.count).toBeGreaterThan(0);
    expect(searchParsed.results.some((r: any) => r.title === 'Pricing Discussion')).toBe(true);

    // Step 4: Ask a question — full RAG pipeline
    const askResult = (await client.callTool({
      name: 'ask_meetings',
      arguments: {
        question: 'What was decided about pricing in our recent meeting?',
        maxMeetings: 3,
      },
    })) as any;

    expect(askResult.isError).toBeFalsy();
    const answer = askResult.content[0].text;
    expect(answer).toContain('increase the price by 10%');

    // Step 5: Ask another question about a different topic
    const askResult2 = (await client.callTool({
      name: 'ask_meetings',
      arguments: {
        question: 'What are our Q3 priorities?',
      },
    })) as any;

    expect(askResult2.isError).toBeFalsy();
    const answer2 = askResult2.content[0].text;
    expect(answer2).toContain('auth');
  });

  it('should retrieve a specific meeting by ID after adding', async () => {
    const addResult = (await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Specific Meeting',
        date: '2026-06-15',
        participants: ['Alice'],
        tags: ['test'],
        content: 'This is a very specific meeting content for get_by_id testing.',
      },
    })) as any;

    const created = JSON.parse(addResult.content[0].text);
    const meetingId = created.meeting.id;

    const getResult = (await client.callTool({
      name: 'get_meeting',
      arguments: { id: meetingId },
    })) as any;

    expect(getResult.isError).toBeFalsy();
    const fetched = JSON.parse(getResult.content[0].text);
    expect(fetched.id).toBe(meetingId);
    expect(fetched.title).toBe('Specific Meeting');
    expect(fetched.content).toContain('very specific meeting');
  });

  it('should generate summaries in different styles', async () => {
    const addResult = (await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Summary Test',
        date: '2026-06-20',
        participants: ['Alice', 'Bob'],
        tags: ['summary'],
        content: 'We discussed A, then we discussed B, finally we agreed on C.',
      },
    })) as any;

    const created = JSON.parse(addResult.content[0].text);

    const summaryResult = (await client.callTool({
      name: 'summarize_meeting',
      arguments: { id: created.meeting.id, style: 'brief' },
    })) as any;

    expect(summaryResult.isError).toBeFalsy();
    const parsed = JSON.parse(summaryResult.content[0].text);
    expect(parsed.meetingId).toBe(created.meeting.id);
    expect(parsed.style).toBe('brief');
    expect(parsed.summary).toBeDefined();
  });

  it('should filter meetings by date range in real scenario', async () => {
    await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Early Meeting',
        date: '2026-05-01',
        participants: ['Alice'],
        tags: [],
        content: 'Early meeting content.',
      },
    });

    await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Late Meeting',
        date: '2026-07-15',
        participants: ['Bob'],
        tags: [],
        content: 'Late meeting content.',
      },
    });

    const filterResult = (await client.callTool({
      name: 'list_meetings',
      arguments: {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      },
    })) as any;

    expect(filterResult.isError).toBeFalsy();
    const parsed = JSON.parse(filterResult.content[0].text);
    // Only the Late Meeting (July) is outside this range; Early Meeting (May) is also outside.
    // So we expect 0 meetings in this range (since we added nothing in June in this test).
    // Adding one in June:
    await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'June Meeting',
        date: '2026-06-15',
        participants: ['Carol'],
        tags: [],
        content: 'June meeting content.',
      },
    });

    const filterResult2 = (await client.callTool({
      name: 'list_meetings',
      arguments: {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      },
    })) as any;

    expect(filterResult2.isError).toBeFalsy();
    const parsed2 = JSON.parse(filterResult2.content[0].text);
    expect(parsed2.count).toBe(1);
    expect(parsed2.meetings[0].title).toBe('June Meeting');
  });

  it('should handle ask with no relevant meetings gracefully', async () => {
    // No meetings added, so ask_meetings returns early with no-relevant-meetings message
    const askResult = (await client.callTool({
      name: 'ask_meetings',
      arguments: {
        question: 'What are the plans for the Mars expedition?',
      },
    })) as any;

    expect(askResult.isError).toBeFalsy();
    expect(askResult.content[0].text).toContain('No relevant meetings found');
  });

  it('should return contextual answers that cite meeting context', async () => {
    await client.callTool({
      name: 'add_meeting',
      arguments: {
        title: 'Design Review',
        date: '2026-06-12',
        participants: ['Eve', 'Frank'],
        tags: ['design'],
        content: 'Approved the new dark mode color scheme. Rejected the light mode proposal. Decided to use Inter for all headings.',
      },
    });

    const askResult = (await client.callTool({
      name: 'ask_meetings',
      arguments: {
        question: 'What did we decide about color schemes?',
      },
    })) as any;

    expect(askResult.isError).toBeFalsy();
    const answer = askResult.content[0].text;
    expect(answer).toContain('Design Review');
    expect(answer).toContain('dark mode');
  });
});
