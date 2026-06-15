/**
 * Tests for logger.ts utility
 */

import { logger, LogLevel } from '../utils/logger.js';

describe('LogLevel enum', () => {
  it('should contain all log levels', () => {
    expect(LogLevel.DEBUG).toBe('debug');
    expect(LogLevel.INFO).toBe('info');
    expect(LogLevel.WARN).toBe('warn');
    expect(LogLevel.ERROR).toBe('error');
  });
});

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  describe('default behavior (INFO level)', () => {
    it('should not log debug messages', () => {
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('info message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe('info');
      expect(logged.message).toBe('info message');
    });

    it('should log warn messages', () => {
      logger.warn('warn message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe('warn');
    });

    it('should log error messages to stderr', () => {
      logger.error('error message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      
      const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logged.level).toBe('error');
      expect(logged.message).toBe('error message');
    });
  });

  describe('DEBUG level', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
    });

    it('should log debug messages when LOG_LEVEL=debug', () => {
      logger.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe('debug');
      expect(logged.message).toBe('debug message');
    });

    it('should log all levels when LOG_LEVEL=debug', () => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('WARN level', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'warn';
    });

    it('should not log debug messages', () => {
      logger.debug('debug');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log info messages', () => {
      logger.info('info');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('warn');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should log error messages', () => {
      logger.error('error');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('ERROR level', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'error';
    });

    it('should not log info or warn messages', () => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should only log error messages', () => {
      logger.error('error only');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('log format', () => {
    it('should include timestamp', () => {
      const before = new Date().toISOString();
      logger.info('test');
      const after = new Date().toISOString();
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.timestamp).toBeDefined();
      expect(new Date(logged.timestamp).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
      expect(new Date(logged.timestamp).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
    });

    it('should include message', () => {
      logger.info('my message');
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.message).toBe('my message');
    });

    it('should include level', () => {
      logger.info('test');
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe('info');
    });

    it('should include metadata', () => {
      logger.info('test', { userId: 123, action: 'login' });
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.userId).toBe(123);
      expect(logged.action).toBe('login');
    });

    it('should handle multiple metadata fields', () => {
      logger.warn('warning', { count: 5, threshold: 10, exceeded: true });
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.count).toBe(5);
      expect(logged.threshold).toBe(10);
      expect(logged.exceeded).toBe(true);
    });

    it('should include no extra fields without metadata', () => {
      logger.info('simple');
      
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(Object.keys(logged)).toEqual(['timestamp', 'level', 'message']);
    });
  });

  describe('case insensitivity', () => {
    it('should accept uppercase LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      
      logger.debug('should log');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should accept mixed case LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'Warn';
      
      logger.info('should not log');
      logger.warn('should log');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalid LOG_LEVEL', () => {
    it('should default to INFO for unknown log levels', () => {
      process.env.LOG_LEVEL = 'unknown';
      
      logger.debug('should not log');
      logger.info('should log');
      logger.warn('should log');
      logger.error('should log');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should default to INFO for empty LOG_LEVEL', () => {
      process.env.LOG_LEVEL = '';
      
      logger.debug('should not log');
      logger.info('should log');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('logger methods', () => {
    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });
  });
});
