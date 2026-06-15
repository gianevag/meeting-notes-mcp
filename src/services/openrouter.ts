/**
 * OpenRouter API client
 * Handles embeddings and chat completions with configurable base URL
 */

import { getConfig } from '../config/index.js';
import { withRetry, RetryableError } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface EmbeddingRequest {
  model: string;
  input: string;
}

export interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = OPENROUTER_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://meeting-notes-mcp.local',
        'X-Title': 'Meeting Notes MCP Server',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // For retry logic: throw retryable errors for 5xx and 429
      if (response.status >= 500 || response.status === 429) {
        throw new RetryableError(
          `OpenRouter API error: ${response.status} ${response.statusText}`
        );
      }
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Generate embeddings for the given text (with retry)
   */
  async createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return withRetry(
      () => this.request<EmbeddingResponse>('/embeddings', request),
      'OpenRouter embedding'
    );
  }

  /**
   * Generate a chat completion (with retry)
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    return withRetry(
      () => this.request<ChatCompletionResponse>('/chat/completions', request),
      'OpenRouter chat completion'
    );
  }
}

let client: OpenRouterClient | null = null;

/**
 * Get or create the OpenRouter client singleton
 */
export function getOpenRouterClient(): OpenRouterClient {
  if (client) return client;

  const config = getConfig();
  client = new OpenRouterClient(config.openRouterApiKey);
  return client;
}

/**
 * Reset the client (useful for testing)
 */
export function resetOpenRouterClient(): void {
  client = null;
}

export { OpenRouterClient };
