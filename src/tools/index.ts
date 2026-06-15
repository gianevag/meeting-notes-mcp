/**
 * MCP Tool Registration
 * Registers all 6 meeting tools with the McpServer
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initDatabase } from '../db/connection.js';
import { MeetingRepository } from '../db/meetings.js';
import { MeetingInput } from '../types/meeting.js';
import { generateEmbedding } from '../services/embedding.js';
import { getOpenRouterClient } from '../services/openrouter.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  AddMeetingSchema,
  GetMeetingSchema,
  ListMeetingsSchema,
  SearchMeetingsSchema,
  SummarizeMeetingSchema,
  AskMeetingsSchema,
} from '../validations/schemas.js';

function getMeetingRepo(): MeetingRepository {
  return new MeetingRepository(initDatabase());
}

/**
 * Register all 6 MCP tools on the given server instance.
 * An optional MeetingRepository can be injected for testing.
 */
export function registerTools(server: McpServer, repoOverride?: MeetingRepository): void {
  const repo = repoOverride || getMeetingRepo();

  // ── add_meeting ───────────────────────────────────────────────────
  server.registerTool(
    'add_meeting',
    {
      description:
        'Store a new meeting with title, date, participants, tags, and full content. Automatically generates an embedding for semantic search.',
      inputSchema: AddMeetingSchema,
    },
    async (args) => {
      try {
        const meeting: MeetingInput = {
          title: args.title,
          date: args.date,
          participants: args.participants,
          tags: args.tags,
          content: args.content,
        };
        const created = repo.create(meeting);

        // Generate and store embedding
        const embedding = await generateEmbedding(meeting.content);
        repo.saveEmbedding(created.id, embedding);

        logger.info('Meeting added via MCP tool', { id: created.id });

        return {
          content: [
            { type: 'text', text: JSON.stringify({ success: true, meeting: created }) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('add_meeting error', { error: message });
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── get_meeting ───────────────────────────────────────────────────
  server.registerTool(
    'get_meeting',
    {
      description: 'Retrieve a single meeting by its ID',
      inputSchema: GetMeetingSchema,
    },
    async (args) => {
      try {
        const meeting = repo.getById(args.id);
        if (!meeting) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: `Meeting ${args.id} not found` }) },
            ],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(meeting) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── list_meetings ─────────────────────────────────────────────────
  server.registerTool(
    'list_meetings',
    {
      description: 'List meetings with optional filters (date range, participant, or tag)',
      inputSchema: ListMeetingsSchema,
    },
    async (args) => {
      try {
        const meetings = repo.list({
          startDate: args.startDate,
          endDate: args.endDate,
          participant: args.participant,
          tag: args.tag,
        });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ count: meetings.length, meetings }) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── search_meetings ───────────────────────────────────────────────
  server.registerTool(
    'search_meetings',
    {
      description: 'Search meetings semantically by content similarity',
      inputSchema: SearchMeetingsSchema,
    },
    async (args) => {
      try {
        const embedding = await generateEmbedding(args.query);
        const results = repo.searchSimilar(embedding, args.limit);
        const simplified = results.map((r) => ({
          id: r.meeting.id,
          title: r.meeting.title,
          date: r.meeting.date,
          distance: r.distance,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: simplified.length, results: simplified }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── summarize_meeting ─────────────────────────────────────────────
  server.registerTool(
    'summarize_meeting',
    {
      description:
        'Generate a summary of a specific meeting in the requested style (brief, detailed, or bullets)',
      inputSchema: SummarizeMeetingSchema,
    },
    async (args) => {
      try {
        const meeting = repo.getById(args.id);
        if (!meeting) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Meeting ${args.id} not found` }),
              },
            ],
            isError: true,
          };
        }

        const config = getConfig();
        const client = getOpenRouterClient();
        const stylePrompt = {
          brief: 'Provide a brief 1-2 sentence summary.',
          detailed: 'Provide a detailed paragraph summary.',
          bullets: 'Provide a bullet-point summary.',
        }[args.style];

        const response = await client.createChatCompletion({
          model: config.chatModel,
          messages: [
            {
              role: 'system',
              content: `You are a meeting summarizer. ${stylePrompt}`,
            },
            { role: 'user', content: meeting.content },
          ],
        });

        const summary = response.choices[0].message.content;
        repo.updateSummary(meeting.id, summary);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ meetingId: meeting.id, summary, style: args.style }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── ask_meetings ──────────────────────────────────────────────────
  server.registerTool(
    'ask_meetings',
    {
      description:
        'Answer natural-language questions about meetings using RAG (retrieval-augmented generation)',
      inputSchema: AskMeetingsSchema,
    },
    async (args) => {
      try {
        const config = getConfig();
        const maxMeetings = args.maxMeetings || config.maxContextMeetings;

        // Embed question
        const queryEmbedding = await generateEmbedding(args.question);

        // Retrieve similar meetings
        const results = repo.searchSimilar(queryEmbedding, maxMeetings);

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No relevant meetings found to answer this question.',
              },
            ],
          };
        }

        // Build context
        const context = results
          .map(
            (r) =>
              `Meeting: ${r.meeting.title} (Date: ${r.meeting.date})\n${r.meeting.content}`
          )
          .join('\n\n---\n\n');

        // Generate answer
        const client = getOpenRouterClient();
        const response = await client.createChatCompletion({
          model: config.chatModel,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant answering questions about past meetings. Use the provided meeting context to answer accurately. If the context does not contain the answer, say so.',
            },
            {
              role: 'user',
              content: `Context from relevant meetings:\n\n${context}\n\nQuestion: ${args.question}`,
            },
          ],
        });

        const answer = response.choices[0].message.content;

        return {
          content: [{ type: 'text', text: answer }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
