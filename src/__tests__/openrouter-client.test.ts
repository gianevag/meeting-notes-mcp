/**
 * Unit tests for OpenRouter client (Phase 7.3)
 * Tests the OpenRouterClient class with mocked fetch responses
 */

import { OpenRouterClient, getOpenRouterClient, resetOpenRouterClient } from '../services/openrouter.js';
import { RetryableError, NonRetryableError } from '../utils/retry.js';

// Mock the logger
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config
jest.mock('../config/index.js', () => ({
  getConfig: jest.fn().mockReturnValue({
    openRouterApiKey: 'test-api-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
  }),
}));

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    resetOpenRouterClient();
    client = new OpenRouterClient('test-api-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetOpenRouterClient();
  });

  // --- Constructor ---
  describe('constructor', () => {
    it('should create client with API key', () => {
      const c = new OpenRouterClient('my-key');
      expect(c).toBeDefined();
    });

    it('should create client with custom base URL', () => {
      const c = new OpenRouterClient('my-key', 'https://custom.api.com/v1');
      expect(c).toBeDefined();
    });
  });

  // --- createEmbedding ---
  describe('createEmbedding', () => {
    it('should return embedding response on success', async () => {
      const mockResponse = {
        object: 'list' as const,
        data: [{
          object: 'embedding' as const,
          embedding: new Array(1536).fill(0.1),
          index: 0,
        }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.createEmbedding({
        model: 'openai/text-embedding-3-small',
        input: 'test text',
      });

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      );
    });

    it('should send correct request body for embeddings', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({
          object: 'list',
          data: [{ object: 'embedding', embedding: [], index: 0 }],
          model: 'test-model',
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

      await client.createEmbedding({
        model: 'openai/text-embedding-3-small',
        input: 'hello world',
      });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        model: 'openai/text-embedding-3-small',
        input: 'hello world',
      });
    });

    it('should include HTTP-Referer and X-Title headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({
          object: 'list',
          data: [{ object: 'embedding', embedding: [], index: 0 }],
          model: 'test-model',
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

      await client.createEmbedding({
        model: 'test-model',
        input: 'test',
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toMatchObject({
        'HTTP-Referer': 'https://meeting-notes-mcp.local',
        'X-Title': 'Meeting Notes MCP Server',
      });
    });

    it('should retry on 5xx errors and eventually succeed', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValueOnce({
            object: 'list',
            data: [{ object: 'embedding', embedding: [], index: 0 }],
            model: 'test-model',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
        });

      const result = await client.createEmbedding({
        model: 'test-model',
        input: 'test',
      });

      expect(result).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should retry on 429 rate limit errors', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValueOnce({
            object: 'list',
            data: [{ object: 'embedding', embedding: [], index: 0 }],
            model: 'test-model',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
        });

      const result = await client.createEmbedding({
        model: 'test-model',
        input: 'test',
      });

      expect(result).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should not retry on 4xx client errors (except 429)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(
        client.createEmbedding({ model: 'test-model', input: 'test' })
      ).rejects.toThrow();
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should throw on authentication errors (401)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        client.createEmbedding({ model: 'test-model', input: 'test' })
      ).rejects.toThrow();
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should throw with error body for non-retryable errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: jest.fn().mockResolvedValueOnce('{"error": "model not found"}'),
      });

      await expect(
        client.createEmbedding({ model: 'test-model', input: 'test' })
      ).rejects.toThrow('model not found');
    });
  });

  // --- createChatCompletion ---
  describe('createChatCompletion', () => {
    it('should return chat completion response on success', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: 1234567890,
        model: 'anthropic/claude-sonnet-4-20250514',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'Hello, how can I help?' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.createChatCompletion({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages: [
          { role: 'user' as const, content: 'Hello' },
        ],
      });

      expect(result).toEqual(mockResponse);
      expect(result.choices[0].message.content).toBe('Hello, how can I help?');
    });

    it('should send correct request body for chat completion', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({
          id: 'test',
          object: 'chat.completion',
          created: 1,
          model: 'test-model',
          choices: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      });

      await client.createChatCompletion({
        model: 'test-model',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        model: 'test-model',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });
    });

    it('should retry on 5xx errors for chat completions', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValueOnce({
            id: 'test',
            object: 'chat.completion',
            created: 1,
            model: 'test-model',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: 'Success after retry' },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          }),
        });

      const result = await client.createChatCompletion({
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.choices[0].message.content).toBe('Success after retry');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15000);
  });

  // --- Error handling ---
  describe('error handling', () => {
    it('should handle network errors (fetch failed)', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        client.createEmbedding({ model: 'test', input: 'test' })
      ).rejects.toThrow();
    });

    it('should handle JSON parsing errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValueOnce(new SyntaxError('Unexpected token')),
      });

      await expect(
        client.createEmbedding({ model: 'test', input: 'test' })
      ).rejects.toThrow();
    });

    it('should handle empty response body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({}),
      });

      // Should not throw — the client returns whatever JSON.parse gives
      const result = await client.createEmbedding({ model: 'test', input: 'test' });
      expect(result).toEqual({});
    });
  });

  // --- Singleton pattern ---
  describe('getOpenRouterClient', () => {
    it('should return the same instance on multiple calls', () => {
      const c1 = getOpenRouterClient();
      const c2 = getOpenRouterClient();
      expect(c1).toBe(c2);
    });

    it('should create new instance after reset', () => {
      const c1 = getOpenRouterClient();
      resetOpenRouterClient();
      const c2 = getOpenRouterClient();
      expect(c1).not.toBe(c2);
    });
  });

  // --- Integration with retry count ---
  describe('retry exhaustion', () => {
    it('should fail after max retries (3 retries = 4 total attempts)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(
        client.createEmbedding({ model: 'test', input: 'test' })
      ).rejects.toThrow();
      
      // Initial attempt + 3 retries = 4 calls
      expect(fetchMock).toHaveBeenCalledTimes(4);
    }, 15000);
  });
});
