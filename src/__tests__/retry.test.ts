/**
 * Tests for retry.ts utility
 */

import { withRetry, RetryableError, NonRetryableError } from '../utils/retry.js';

// Mock the logger to avoid console noise in tests
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('successful operations', () => {
    it('should return result on first attempt when operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation, 'test-operation');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should work with generic return types', async () => {
      interface TestData {
        id: number;
        name: string;
      }
      const testData: TestData = { id: 1, name: 'test' };
      const operation = jest.fn().mockResolvedValue(testData);
      
      const result = await withRetry<TestData>(operation);
      
      expect(result).toEqual(testData);
    });

    it('should use default operation name when not provided', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      
      await withRetry(operation);
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryable errors', () => {
    it('should retry on RetryableError and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new RetryableError('transient failure'))
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, 'retry-test');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on fetch errors', async () => {
      const fetchError = new TypeError('fetch failed');
      const operation = jest
        .fn()
        .mockRejectedValueOnce(fetchError)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx HTTP errors', async () => {
      const response500 = new Response(null, { status: 500 });
      const response200 = new Response(null, { status: 200 });
      const operation = jest
        .fn()
        .mockRejectedValueOnce(response500)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on rate limiting (429)', async () => {
      const response429 = new Response(null, { status: 429 });
      const operation = jest
        .fn()
        .mockRejectedValueOnce(response429)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry exactly MAX_RETRIES (3) times before giving up', async () => {
      const operation = jest.fn().mockRejectedValue(new RetryableError('always fails'));
      
      await expect(withRetry(operation, 'max-retry-test')).rejects.toThrow(
        'max-retry-test failed after 4 attempts'
      );
      expect(operation).toHaveBeenCalledTimes(4); // initial + 3 retries
    }, 15000);
  });

  describe('non-retryable errors', () => {
    it('should not retry on 4xx errors (except 429)', async () => {
      const response400 = new Response(null, { status: 400 });
      const operation = jest.fn().mockRejectedValue(response400);
      
      await expect(withRetry(operation, 'bad-request')).rejects.toThrow(NonRetryableError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 errors', async () => {
      const response404 = new Response(null, { status: 404 });
      const operation = jest.fn().mockRejectedValue(response404);
      
      await expect(withRetry(operation)).rejects.toThrow(NonRetryableError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw NonRetryableError with original message', async () => {
      const error = new Error('something is wrong');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(withRetry(operation, 'custom-op')).rejects.toThrow(
        'custom-op failed: something is wrong'
      );
    });

    it('should handle non-Error throwables', async () => {
      const operation = jest.fn().mockRejectedValue('string error');
      
      await expect(withRetry(operation)).rejects.toThrow(NonRetryableError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should include original error as cause', async () => {
      const originalError = new Error('original');
      const operation = jest.fn().mockRejectedValue(originalError);
      
      try {
        await withRetry(operation);
        fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NonRetryableError);
        expect((error as NonRetryableError).cause).toBe(originalError);
      }
    });
  });

  describe('error classes', () => {
    it('should create RetryableError with correct name', () => {
      const error = new RetryableError('test message');
      expect(error.name).toBe('RetryableError');
      expect(error.message).toBe('test message');
    });

    it('should create RetryableError with cause', () => {
      const cause = new Error('root cause');
      const error = new RetryableError('test', cause);
      expect(error.cause).toBe(cause);
    });

    it('should create NonRetryableError with correct name', () => {
      const error = new NonRetryableError('test message');
      expect(error.name).toBe('NonRetryableError');
      expect(error.message).toBe('test message');
    });

    it('should create NonRetryableError with cause', () => {
      const cause = new Error('root cause');
      const error = new NonRetryableError('test', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('edge cases', () => {
    it('should handle ECONNREFUSED error', async () => {
      const error = new Error('ECONNREFUSED');
      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      expect(result).toBe('success');
    });

    it('should handle ENOTFOUND error', async () => {
      const error = new Error('ENOTFOUND');
      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      expect(result).toBe('success');
    });

    it('should handle abort errors', async () => {
      const error = new Error('AbortError');
      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await withRetry(operation);
      expect(result).toBe('success');
    });

    it('should include attempt count in RetryableError when all retries exhausted', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('timeout'));
      
      await expect(withRetry(operation, 'exhausted')).rejects.toThrow(
        'exhausted failed after 4 attempts'
      );
    }, 15000);
  });
});
