/**
 * Database connection and initialization
 * Handles sqlite-vec extension loading with better-sqlite3
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getConfig } from '../config/index.js';
import { withDbErrorHandling } from '../utils/db-errors.js';
import { logger } from '../utils/logger.js';

let db: Database.Database | null = null;

/**
 * Initialize the database connection and load extensions
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const config = getConfig();

  try {
    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');

    // Load sqlite-vec extension
    db.loadExtension(sqliteVec.getLoadablePath());

    // Create tables
    createTables(db);

    logger.info('Database initialized successfully', { path: config.databasePath });

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize database', { path: config.databasePath, error: message });
    throw new Error(`Database initialization failed: ${message}`);
  }
}

/**
 * Get the existing database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Create all required tables
 */
function createTables(db: Database.Database): void {
  // Main meetings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      participants TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Virtual table for vector embeddings via sqlite-vec
  // rowid maps directly to meetings.id
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS meeting_embeddings USING vec0(
      embedding float[1536]
    );
  `);

  // Indices for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meetings_title ON meetings(title);
  `);
}
