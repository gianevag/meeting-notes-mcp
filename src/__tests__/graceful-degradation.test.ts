/**
 * Tests for graceful-degradation.ts utility
 */

import {
  withGracefulDegradation,
  withGracefulDegradationSync,
  safeQuery,
  safeGet,
  DegradedResult,
} from '../utils/graceful-degradation.js';

// Mock the logger
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('withGracefulDegradation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return success result when operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('data');
    
    const result = await withGracefulDegradation(operation, 'default', 'test-op');
    
    expect(result).toEqual<DegradedResult<string>>({
      success: true,
      data: 'data',
      errors: [],
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should return success with complex data types', async () => {
    interface TestData {
      items: number[];
      meta: { count: number };
    }
    const testData: TestData = { items: [1, 2, 3], meta: { count: 3 } };
    const operation = jest.fn().mockResolvedValue(testData);
    
    const result = await withGracefulDegradation(operation, { items: [], meta: { count: 0 } });
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual(testData);
    expect(result.errors).toEqual([]);
  });

  it('should return default value when operation fails', async () => {
    const error = new Error('something went wrong');
    const operation = jest.fn().mockRejectedValue(error);
    const defaultValue = 'fallback';
    
    const result = await withGracefulDegradation(operation, defaultValue, 'test-op');
    
    expect(result).toEqual<DegradedResult<string>>({
      success: false,
      data: 'fallback',
      errors: ['test-op failed: something went wrong'],
    });
  });

  it('should return default value with errors array when operation fails', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('database error'));
    const defaultValue: string[] = [];
    
    const result = await withGracefulDegradation(operation, defaultValue, 'search');
    
    expect(result.success).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('database error');
  });

  it('should handle non-Error rejections', async () => {
    const operation = jest.fn().mockRejectedValue('string error');
    
    const result = await withGracefulDegradation(operation, 42, 'number-op');
    
    expect(result.success).toBe(false);
    expect(result.data).toBe(42);
    expect(result.errors[0]).toContain('string error');
  });

  it('should use default operation name when not provided', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));
    
    const result = await withGracefulDegradation(operation, null);
    
    expect(result.errors[0]).toContain('operation failed');
  });

  it('should handle null default value', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('not found'));
    
    const result = await withGracefulDegradation(operation, null, 'get');
    
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it('should handle undefined as default value', async () => {
    const operation = jest.fn().mockResolvedValue('value');
    
    const result = await withGracefulDegradation(operation, undefined);
    
    expect(result.success).toBe(true);
    expect(result.data).toBe('value');
  });
});

describe('withGracefulDegradationSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return success result when sync operation succeeds', () => {
    const operation = jest.fn().mockReturnValue(42);
    
    const result = withGracefulDegradationSync(operation, 0, 'sync-op');
    
    expect(result).toEqual<DegradedResult<number>>({
      success: true,
      data: 42,
      errors: [],
    });
  });

  it('should return default value when sync operation throws', () => {
    const operation = jest.fn().mockImplementation(() => {
      throw new Error('sync error');
    });
    
    const result = withGracefulDegradationSync(operation, 'default', 'sync-op');
    
    expect(result.success).toBe(false);
    expect(result.data).toBe('default');
    expect(result.errors).toEqual(['sync-op failed: sync error']);
  });

  it('should handle objects in sync operations', () => {
    const operation = jest.fn().mockReturnValue({ key: 'value' });
    
    const result = withGracefulDegradationSync(operation, {});
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('should handle non-Error exceptions', () => {
    const operation = jest.fn().mockImplementation(() => {
      throw 123;
    });
    
    const result = withGracefulDegradationSync(operation, 'fallback');
    
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('123');
  });
});

describe('safeQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return query results when successful', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const queryFn = jest.fn().mockResolvedValue(items);
    
    const result = await safeQuery(queryFn, 'list-items');
    
    expect(result).toEqual(items);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when query fails', async () => {
    const queryFn = jest.fn().mockRejectedValue(new Error('query failed'));
    
    const result = await safeQuery(queryFn, 'search');
    
    expect(result).toEqual([]);
  });

  it('should use default operation name when not provided', async () => {
    const queryFn = jest.fn().mockResolvedValue([1, 2, 3]);
    
    const result = await safeQuery(queryFn);
    
    expect(result).toEqual([1, 2, 3]);
  });

  it('should handle complex array types', async () => {
    interface Item {
      name: string;
      value: number;
    }
    const items: Item[] = [{ name: 'a', value: 1 }];
    const queryFn = jest.fn().mockResolvedValue(items);
    
    const result = await safeQuery<Item>(queryFn);
    
    expect(result).toEqual(items);
  });
});

describe('safeGet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return item when get succeeds', async () => {
    const item = { id: 1, name: 'test' };
    const getFn = jest.fn().mockResolvedValue(item);
    
    const result = await safeGet(getFn, 'get-item');
    
    expect(result).toEqual(item);
  });

  it('should return null when item not found', async () => {
    const getFn = jest.fn().mockResolvedValue(null);
    
    const result = await safeGet(getFn, 'get-item');
    
    expect(result).toBeNull();
  });

  it('should return null when get fails', async () => {
    const getFn = jest.fn().mockRejectedValue(new Error('get failed'));
    
    const result = await safeGet(getFn, 'get-item');
    
    expect(result).toBeNull();
  });

  it('should use default operation name when not provided', async () => {
    const getFn = jest.fn().mockResolvedValue('found');
    
    const result = await safeGet(getFn);
    
    expect(result).toBe('found');
  });

  it('should handle undefined return values', async () => {
    const getFn = jest.fn().mockResolvedValue(undefined);
    
    const result = await safeGet(getFn);
    
    expect(result).toBeUndefined();
  });
});

describe('DegradedResult interface', () => {
  it('should have correct shape for success', () => {
    const result: DegradedResult<number> = {
      success: true,
      data: 42,
      errors: [],
    };
    
    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
    expect(result.errors).toEqual([]);
  });

  it('should have correct shape for failure', () => {
    const result: DegradedResult<number> = {
      success: false,
      data: 0,
      errors: ['something went wrong'],
    };
    
    expect(result.success).toBe(false);
    expect(result.data).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
