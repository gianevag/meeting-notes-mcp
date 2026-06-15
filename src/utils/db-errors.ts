/**
 * SQLite error handling wrapper
 * Converts raw SQLite errors to user-friendly messages
 * Provides graceful degradation where appropriate
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';

export enum SQLiteErrorCode {
  SQLITE_CONSTRAINT = 'SQLITE_CONSTRAINT',
  SQLITE_CONSTRAINT_UNIQUE = 'SQLITE_CONSTRAINT_UNIQUE',
  SQLITE_CONSTRAINT_FOREIGNKEY = 'SQLITE_CONSTRAINT_FOREIGNKEY',
  SQLITE_CONSTRAINT_NOTNULL = 'SQLITE_CONSTRAINT_NOTNULL',
  SQLITE_BUSY = 'SQLITE_BUSY',
  SQLITE_LOCKED = 'SQLITE_LOCKED',
  SQLITE_READONLY = 'SQLITE_READONLY',
  SQLITE_IOERR = 'SQLITE_IOERR',
  SQLITE_CORRUPT = 'SQLITE_CORRUPT',
  SQLITE_NOTFOUND = 'SQLITE_NOTFOUND',
  SQLITE_FULL = 'SQLITE_FULL',
  SQLITE_CANTOPEN = 'SQLITE_CANTOPEN',
  SQLITE_PROTOCOL = 'SQLITE_PROTOCOL',
  SQLITE_TOOBIG = 'SQLITE_TOOBIG',
  SQLITE_NOMEM = 'SQLITE_NOMEM',
  SQLITE_MISMATCH = 'SQLITE_MISMATCH',
}

export class SQLiteError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SQLiteError';
  }
}

/**
 * Extract SQLite error code from an error object
 */
function extractErrorCode(error: unknown): string {
  if (error instanceof Database.SqliteError) {
    return error.code;
  }
  if (error instanceof Error && 'code' in error) {
    return String((error as Error & { code: unknown }).code);
  }
  return 'UNKNOWN';
}

/**
 * Get a user-friendly message for a given SQLite error code
 */
function getFriendlyMessage(code: string, originalMessage: string): string {
  switch (code) {
    case SQLiteErrorCode.SQLITE_CONSTRAINT_UNIQUE:
      return 'A record with this information already exists.';
    case SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY:
      return 'This operation references a record that does not exist.';
    case SQLiteErrorCode.SQLITE_CONSTRAINT_NOTNULL:
      return 'A required field is missing.';
    case SQLiteErrorCode.SQLITE_CONSTRAINT:
      return 'This operation violates a database constraint.';
    case SQLiteErrorCode.SQLITE_BUSY:
      return 'The database is currently busy. Please try again.';
    case SQLiteErrorCode.SQLITE_LOCKED:
      return 'The database is locked by another process.';
    case SQLiteErrorCode.SQLITE_READONLY:
      return 'The database is read-only.';
    case SQLiteErrorCode.SQLITE_IOERR:
      return 'A disk I/O error occurred. Check disk space and permissions.';
    case SQLiteErrorCode.SQLITE_CORRUPT:
      return 'The database file appears to be corrupted.';
    case SQLiteErrorCode.SQLITE_NOTFOUND:
      return 'The requested resource was not found in the database.';
    case SQLiteErrorCode.SQLITE_FULL:
      return 'The database or disk is full.';
    case SQLiteErrorCode.SQLITE_CANTOPEN:
      return 'Unable to open the database file. Check the path and permissions.';
    case SQLiteErrorCode.SQLITE_PROTOCOL:
      return 'Database protocol error. This may indicate file locking issues.';
    case SQLiteErrorCode.SQLITE_TOOBIG:
      return 'The data being inserted is too large.';
    case SQLiteErrorCode.SQLITE_NOMEM:
      return 'The system is out of memory.';
    case SQLiteErrorCode.SQLITE_MISMATCH:
      return 'Data type mismatch in query.';
    default:
      return `Database error: ${originalMessage}`;
  }
}

/**
 * Determine if an error should result in graceful degradation (empty results)
 * vs. throwing an error
 */
export function shouldDegradeGracefully(code: string): boolean {
  // For now, most errors should throw. We can selectively degrade
  // for search/list operations where empty results make sense.
  return false;
}

/**
 * Wrap a database operation with error handling
 * @param operation - The database operation to execute
 * @param operationName - Human-readable name for logging
 * @returns The result of the operation, or null if graceful degradation applies
 * @throws SQLiteError with user-friendly message
 */
export function withDbErrorHandling<T>(
  operation: () => T,
  operationName: string = 'database operation'
): T {
  try {
    return operation();
  } catch (error) {
    const code = extractErrorCode(error);
    const originalMessage = error instanceof Error ? error.message : String(error);
    const friendlyMessage = getFriendlyMessage(code, originalMessage);

    logger.error(`Database error during ${operationName}`, {
      code,
      originalMessage,
      friendlyMessage,
    });

    throw new SQLiteError(friendlyMessage, code, error instanceof Error ? error : undefined);
  }
}

/**
 * Async version of withDbErrorHandling
 */
export async function withDbErrorHandlingAsync<T>(
  operation: () => Promise<T>,
  operationName: string = 'database operation'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = extractErrorCode(error);
    const originalMessage = error instanceof Error ? error.message : String(error);
    const friendlyMessage = getFriendlyMessage(code, originalMessage);

    logger.error(`Database error during ${operationName}`, {
      code,
      originalMessage,
      friendlyMessage,
    });

    throw new SQLiteError(friendlyMessage, code, error instanceof Error ? error : undefined);
  }
}
