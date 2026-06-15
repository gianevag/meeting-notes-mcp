/**
 * Application configuration
 * Reads from environment variables with sensible defaults
 */

import dotenv from 'dotenv';
import { AppConfig } from '../types/meeting.js';

let config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (config) return config;

  dotenv.config();

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  config = {
    openRouterApiKey,
    databasePath: process.env.DATABASE_PATH || './data/meetings.db',
    embeddingModel: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
    chatModel: process.env.CHAT_MODEL || 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: parseInt(process.env.MAX_CONTEXT_MEETINGS || '5', 10),
    mcpUsername: process.env.MCP_USERNAME,
    mcpPassword: process.env.MCP_PASSWORD,
    jwtSecret: process.env.JWT_SECRET,
  };

  return config;
}
