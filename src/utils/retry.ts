/**
 * OpenRouter API retry logic with exponential backoff
 * Max 3 retries on transient failures (5xx, network errors, timeouts)
 */

import { logger } from './logger.js';

export class RetryableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class NonRetryableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

/**
 * Determines if an error is retryable based on HTTP status or error type
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) return true;

  // Network errors, timeouts, DNS failures
  if (error instanceof TypeError || error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('abort')
    ) {
      return true;
    }
  }

  // HTTP status-based retryability
  if (error instanceof Response) {
    const status = error.status;
    // Retry on server errors and rate limiting
    if (status >= 500 || status === 429) return true;
    // Don't retry client errors (4xx except 429)
    if (status >= 400) return false;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for the given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry logic
 * @param operation - The async operation to execute
 * @param operationName - Human-readable name for logging
 * @returns The result of the operation
 * @throws NonRetryableError if the operation fails after all retries or with a non-retryable error
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`Executing ${operationName}`, { attempt: attempt + 1, maxRetries: MAX_RETRIES + 1 });
      const result = await operation();
      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retry(s)`);
      }
      return result;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        logger.warn(`${operationName} failed with non-retryable error`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new NonRetryableError(
          `${operationName} failed: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }

      if (attempt < MAX_RETRIES) {
        const delay = calculateDelay(attempt);
        logger.warn(`${operationName} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${Math.round(delay)}ms`, {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(delay);
      } else {
        logger.error(`${operationName} failed after ${MAX_RETRIES + 1} attempts`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  throw new RetryableError(
    `${operationName} failed after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError
  );
}
