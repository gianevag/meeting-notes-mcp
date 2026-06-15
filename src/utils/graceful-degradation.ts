/**
 * Graceful degradation utilities
 * Ensures the server returns empty results instead of crashing
 * when non-critical operations fail
 */

import { logger } from './logger.js';

export interface DegradedResult<T> {
  success: boolean;
  data: T;
  errors: string[];
}

/**
 * Execute an operation with graceful degradation
 * If the operation fails, returns a default value instead of throwing
 * @param operation - The operation to execute
 * @param defaultValue - The fallback value if operation fails
 * @param operationName - Name for logging
 * @returns Object with success flag, data, and any error messages
 */
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  operationName: string = 'operation'
): Promise<DegradedResult<T>> {
  try {
    const data = await operation();
    return { success: true, data, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`${operationName} degraded gracefully`, { error: message });
    return {
      success: false,
      data: defaultValue,
      errors: [`${operationName} failed: ${message}`],
    };
  }
}

/**
 * Synchronous version of withGracefulDegradation
 */
export function withGracefulDegradationSync<T>(
  operation: () => T,
  defaultValue: T,
  operationName: string = 'operation'
): DegradedResult<T> {
  try {
    const data = operation();
    return { success: true, data, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`${operationName} degraded gracefully`, { error: message });
    return {
      success: false,
      data: defaultValue,
      errors: [`${operationName} failed: ${message}`],
    };
  }
}

/**
 * Wrapper for search/list operations that should always return an array
 * even when the underlying operation fails
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T[]>,
  operationName: string = 'query'
): Promise<T[]> {
  const result = await withGracefulDegradation(queryFn, [], operationName);
  return result.data;
}

/**
 * Wrapper for get-by-id operations that should return null on failure
 */
export async function safeGet<T>(
  getFn: () => Promise<T | null>,
  operationName: string = 'get'
): Promise<T | null> {
  const result = await withGracefulDegradation(getFn, null, operationName);
  return result.data;
}
