/**
 * Tests for db-errors.ts utility
 */

import Database from 'better-sqlite3';
import {
  SQLiteError,
  SQLiteErrorCode,
  withDbErrorHandling,
  withDbErrorHandlingAsync,
  shouldDegradeGracefully,
} from '../utils/db-errors.js';

// Mock the logger
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SQLiteError', () => {
  it('should create error with message, code, and originalError', () => {
    const originalError = new Error('original');
    const error = new SQLiteError('friendly message', 'SQLITE_CONSTRAINT', originalError);
    
    expect(error.message).toBe('friendly message');
    expect(error.code).toBe('SQLITE_CONSTRAINT');
    expect(error.originalError).toBe(originalError);
    expect(error.name).toBe('SQLiteError');
  });

  it('should create error without originalError', () => {
    const error = new SQLiteError('message', 'CODE');
    
    expect(error.originalError).toBeUndefined();
  });
});

describe('SQLiteErrorCode enum', () => {
  it('should contain expected error codes', () => {
    expect(SQLiteErrorCode.SQLITE_CONSTRAINT).toBe('SQLITE_CONSTRAINT');
    expect(SQLiteErrorCode.SQLITE_CONSTRAINT_UNIQUE).toBe('SQLITE_CONSTRAINT_UNIQUE');
    expect(SQLiteErrorCode.SQLITE_CONSTRAINT_FOREIGNKEY).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    expect(SQLiteErrorCode.SQLITE_CONSTRAINT_NOTNULL).toBe('SQLITE_CONSTRAINT_NOTNULL');
    expect(SQLiteErrorCode.SQLITE_BUSY).toBe('SQLITE_BUSY');
    expect(SQLiteErrorCode.SQLITE_LOCKED).toBe('SQLITE_LOCKED');
    expect(SQLiteErrorCode.SQLITE_READONLY).toBe('SQLITE_READONLY');
    expect(SQLiteErrorCode.SQLITE_IOERR).toBe('SQLITE_IOERR');
    expect(SQLiteErrorCode.SQLITE_CORRUPT).toBe('SQLITE_CORRUPT');
    expect(SQLiteErrorCode.SQLITE_NOTFOUND).toBe('SQLITE_NOTFOUND');
    expect(SQLiteErrorCode.SQLITE_FULL).toBe('SQLITE_FULL');
    expect(SQLiteErrorCode.SQLITE_CANTOPEN).toBe('SQLITE_CANTOPEN');
    expect(SQLiteErrorCode.SQLITE_PROTOCOL).toBe('SQLITE_PROTOCOL');
    expect(SQLiteErrorCode.SQLITE_TOOBIG).toBe('SQLITE_TOOBIG');
    expect(SQLiteErrorCode.SQLITE_NOMEM).toBe('SQLITE_NOMEM');
    expect(SQLiteErrorCode.SQLITE_MISMATCH).toBe('SQLITE_MISMATCH');
  });
});

describe('withDbErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result when operation succeeds', () => {
    const operation = jest.fn().mockReturnValue('success');
    
    const result = withDbErrorHandling(operation, 'test-op');
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should return result for complex data types', () => {
    const testData = { id: 1, items: [1, 2, 3] };
    const operation = jest.fn().mockReturnValue(testData);
    
    const result = withDbErrorHandling(operation);
    
    expect(result).toEqual(testData);
  });

  describe('unique constraint errors', () => {
    it('should throw user-friendly message for unique constraint violation', () => {
      const sqliteError = new Database.SqliteError('UNIQUE constraint failed', 'SQLITE_CONSTRAINT_UNIQUE');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation, 'insert')).toThrow(
        new SQLiteError('A record with this information already exists.', 'SQLITE_CONSTRAINT_UNIQUE', sqliteError)
      );
    });
  });

  describe('foreign key constraint errors', () => {
    it('should throw user-friendly message for foreign key violation', () => {
      const sqliteError = new Database.SqliteError('FOREIGN KEY constraint failed', 'SQLITE_CONSTRAINT_FOREIGNKEY');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation, 'insert')).toThrow(
        'This operation references a record that does not exist.'
      );
    });
  });

  describe('not null constraint errors', () => {
    it('should throw user-friendly message for not null violation', () => {
      const sqliteError = new Database.SqliteError('NOT NULL constraint failed', 'SQLITE_CONSTRAINT_NOTNULL');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('A required field is missing.');
    });
  });

  describe('busy errors', () => {
    it('should throw user-friendly message for busy database', () => {
      const sqliteError = new Database.SqliteError('database is locked', 'SQLITE_BUSY');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The database is currently busy. Please try again.');
    });
  });

  describe('locked errors', () => {
    it('should throw user-friendly message for locked database', () => {
      const sqliteError = new Database.SqliteError('database table is locked', 'SQLITE_LOCKED');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The database is locked by another process.');
    });
  });

  describe('read-only errors', () => {
    it('should throw user-friendly message for read-only database', () => {
      const sqliteError = new Database.SqliteError('attempt to write a readonly database', 'SQLITE_READONLY');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The database is read-only.');
    });
  });

  describe('I/O errors', () => {
    it('should throw user-friendly message for disk I/O errors', () => {
      const sqliteError = new Database.SqliteError('disk I/O error', 'SQLITE_IOERR');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('A disk I/O error occurred. Check disk space and permissions.');
    });
  });

  describe('corrupt database errors', () => {
    it('should throw user-friendly message for corrupt database', () => {
      const sqliteError = new Database.SqliteError('database disk image is malformed', 'SQLITE_CORRUPT');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The database file appears to be corrupted.');
    });
  });

  describe('not found errors', () => {
    it('should throw user-friendly message for not found', () => {
      const sqliteError = new Database.SqliteError('unknown database', 'SQLITE_NOTFOUND');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The requested resource was not found in the database.');
    });
  });

  describe('disk full errors', () => {
    it('should throw user-friendly message for full disk', () => {
      const sqliteError = new Database.SqliteError('database or disk is full', 'SQLITE_FULL');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The database or disk is full.');
    });
  });

  describe('cannot open errors', () => {
    it('should throw user-friendly message for cannot open database', () => {
      const sqliteError = new Database.SqliteError('unable to open database file', 'SQLITE_CANTOPEN');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Unable to open the database file. Check the path and permissions.');
    });
  });

  describe('protocol errors', () => {
    it('should throw user-friendly message for protocol error', () => {
      const sqliteError = new Database.SqliteError('locking protocol', 'SQLITE_PROTOCOL');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Database protocol error. This may indicate file locking issues.');
    });
  });

  describe('too big errors', () => {
    it('should throw user-friendly message for data too large', () => {
      const sqliteError = new Database.SqliteError('string or blob too big', 'SQLITE_TOOBIG');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The data being inserted is too large.');
    });
  });

  describe('no memory errors', () => {
    it('should throw user-friendly message for out of memory', () => {
      const sqliteError = new Database.SqliteError('out of memory', 'SQLITE_NOMEM');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('The system is out of memory.');
    });
  });

  describe('mismatch errors', () => {
    it('should throw user-friendly message for data type mismatch', () => {
      const sqliteError = new Database.SqliteError('datatype mismatch', 'SQLITE_MISMATCH');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Data type mismatch in query.');
    });
  });

  describe('generic constraint errors', () => {
    it('should throw user-friendly message for generic constraint violation', () => {
      const sqliteError = new Database.SqliteError('CHECK constraint failed', 'SQLITE_CONSTRAINT');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('This operation violates a database constraint.');
    });
  });

  describe('unknown errors', () => {
    it('should pass through message for unknown error codes', () => {
      const sqliteError = new Database.SqliteError('some random sqlite error', 'SQLITE_SOMETHING');
      const operation = jest.fn().mockImplementation(() => {
        throw sqliteError;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Database error: some random sqlite error');
    });

    it('should handle non-SqliteError errors with code property', () => {
      const error = new Error('custom error') as Error & { code: string };
      error.code = 'CUSTOM_CODE';
      const operation = jest.fn().mockImplementation(() => {
        throw error;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Database error: custom error');
    });

    it('should handle plain Error objects without code', () => {
      const error = new Error('plain error');
      const operation = jest.fn().mockImplementation(() => {
        throw error;
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Database error: plain error');
    });

    it('should handle non-Error throwables', () => {
      const operation = jest.fn().mockImplementation(() => {
        throw 'string error';
      });
      
      expect(() => withDbErrorHandling(operation)).toThrow('Database error: string error');
    });
  });

  it('should wrap error in SQLiteError instance', () => {
    const sqliteError = new Database.SqliteError('constraint failed', 'SQLITE_CONSTRAINT');
    const operation = jest.fn().mockImplementation(() => {
      throw sqliteError;
    });
    
    try {
      withDbErrorHandling(operation, 'test');
      fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SQLiteError);
      expect((error as SQLiteError).code).toBe('SQLITE_CONSTRAINT');
      expect((error as SQLiteError).originalError).toBe(sqliteError);
    }
  });
});

describe('withDbErrorHandlingAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result when async operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('async success');
    
    const result = await withDbErrorHandlingAsync(operation, 'async-op');
    
    expect(result).toBe('async success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should handle async errors with SQLite error codes', async () => {
    const sqliteError = new Database.SqliteError('unique constraint', 'SQLITE_CONSTRAINT_UNIQUE');
    const operation = jest.fn().mockRejectedValue(sqliteError);
    
    await expect(withDbErrorHandlingAsync(operation)).rejects.toThrow(
      'A record with this information already exists.'
    );
  });

  it('should handle async generic errors', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('async error'));
    
    await expect(withDbErrorHandlingAsync(operation, 'my-op')).rejects.toThrow(
      'Database error: async error'
    );
  });

  it('should use default operation name', async () => {
    const sqliteError = new Database.SqliteError('error', 'SQLITE_BUSY');
    const operation = jest.fn().mockRejectedValue(sqliteError);
    
    await expect(withDbErrorHandlingAsync(operation)).rejects.toThrow();
  });
});

describe('shouldDegradeGracefully', () => {
  it('should return false for all error codes by default', () => {
    expect(shouldDegradeGracefully('SQLITE_BUSY')).toBe(false);
    expect(shouldDegradeGracefully('SQLITE_CONSTRAINT')).toBe(false);
    expect(shouldDegradeGracefully('UNKNOWN')).toBe(false);
    expect(shouldDegradeGracefully('')).toBe(false);
  });
});
