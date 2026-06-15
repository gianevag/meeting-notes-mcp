/**
 * Data access layer for meetings
 * Typed CRUD operations with error handling
 */

import Database from 'better-sqlite3';
import {
  Meeting,
  MeetingInput,
  MeetingFilters,
  SearchResult,
} from '../types/meeting.js';
import { withDbErrorHandling } from '../utils/db-errors.js';
import { logger } from '../utils/logger.js';

export class MeetingRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new meeting and return it with generated id and created_at
   */
  create(meeting: MeetingInput): Meeting {
    return withDbErrorHandling(() => {
      const participants = meeting.participants.join(',');
      const tags = meeting.tags.join(',');

      const result = this.db.prepare(`
        INSERT INTO meetings (title, date, participants, tags, content)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        meeting.title,
        meeting.date,
        participants,
        tags,
        meeting.content
      );

      const id = result.lastInsertRowid as number;
      logger.info('Meeting created', { id, title: meeting.title });
      return this.getById(id)!;
    }, 'create meeting');
  }

  /**
   * Get a single meeting by ID
   */
  getById(id: number): Meeting | null {
    return withDbErrorHandling(() => {
      const row = this.db.prepare(`
        SELECT id, title, date, participants, tags, content, summary, created_at
        FROM meetings
        WHERE id = ?
      `).get(id) as MeetingRow | undefined;

      return row ? this.rowToMeeting(row) : null;
    }, 'get meeting by id');
  }

  /**
   * Update the summary of a meeting
   */
  updateSummary(id: number, summary: string): void {
    withDbErrorHandling(() => {
      this.db.prepare(`
        UPDATE meetings SET summary = ? WHERE id = ?
      `).run(summary, id);
      logger.info('Meeting summary updated', { id });
    }, 'update meeting summary');
  }

  /**
   * List meetings with optional filters
   */
  list(filters?: MeetingFilters): Meeting[] {
    return withDbErrorHandling(() => {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (filters?.startDate) {
        conditions.push('date >= ?');
        params.push(filters.startDate);
      }

      if (filters?.endDate) {
        conditions.push('date <= ?');
        params.push(filters.endDate);
      }

      if (filters?.participant) {
        conditions.push(`participants LIKE ?`);
        params.push(`%${filters.participant}%`);
      }

      if (filters?.tag) {
        conditions.push(`tags LIKE ?`);
        params.push(`%${filters.tag}%`);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const rows = this.db.prepare(`
        SELECT id, title, date, participants, tags, content, summary, created_at
        FROM meetings
        ${whereClause}
        ORDER BY date DESC
      `).all(...params) as MeetingRow[];

      return rows.map(row => this.rowToMeeting(row));
    }, 'list meetings');
  }

  /**
   * Delete a meeting by ID
   */
  delete(id: number): boolean {
    return withDbErrorHandling(() => {
      const result = this.db.prepare(`
        DELETE FROM meetings WHERE id = ?
      `).run(id);

      const deleted = result.changes > 0;
      if (deleted) {
        logger.info('Meeting deleted', { id });
      }
      return deleted;
    }, 'delete meeting');
  }

  /**
   * Insert or replace an embedding for a meeting
   */
  saveEmbedding(meetingId: number, embedding: Float32Array): void {
    withDbErrorHandling(() => {
      // sqlite-vec expects embeddings as compact BLOBs
      // and rowid MUST be a BigInt (sqlite-vec rejects JS numbers as REAL)
      const embeddingBytes = Buffer.from(embedding.buffer);

      this.db.prepare(`
        INSERT OR REPLACE INTO meeting_embeddings (rowid, embedding)
        VALUES (?, ?)
      `).run(BigInt(meetingId), embeddingBytes);

      logger.debug('Embedding stored', { meetingId });
    }, 'save embedding');
  }

  /**
   * Search similar meetings using vector similarity
   */
  searchSimilar(embedding: Float32Array, limit: number = 5): SearchResult[] {
    return withDbErrorHandling(() => {
      const embeddingBytes = Buffer.from(embedding.buffer);

      const rows = this.db.prepare(`
        SELECT
          m.id, m.title, m.date, m.participants, m.tags, m.content, m.summary, m.created_at,
          e.distance
        FROM meeting_embeddings AS e
        LEFT JOIN meetings AS m ON m.id = e.rowid
        WHERE e.embedding MATCH ?
          AND e.k = ?
        ORDER BY e.distance
      `).all(embeddingBytes, limit) as (MeetingRow & { distance: number })[];

      return rows.map(row => ({
        meeting: this.rowToMeeting(row),
        distance: row.distance,
      }));
    }, 'search similar meetings');
  }

  /**
   * Delete an embedding for a meeting
   */
  deleteEmbedding(meetingId: number): void {
    withDbErrorHandling(() => {
      // sqlite-vec rowid must be BigInt
      this.db.prepare(`
        DELETE FROM meeting_embeddings WHERE rowid = ?
      `).run(BigInt(meetingId));
    }, 'delete embedding');
  }

  /**
   * Check if a meeting exists
   */
  exists(id: number): boolean {
    return withDbErrorHandling(() => {
      const result = this.db.prepare(`
        SELECT 1 FROM meetings WHERE id = ?
      `).get(id);
      return !!result;
    }, 'check meeting exists');
  }

  /**
   * Convert raw DB row to typed Meeting object
   */
  private rowToMeeting(row: MeetingRow): Meeting {
    return {
      id: row.id,
      title: row.title,
      date: row.date,
      participants: row.participants,
      tags: row.tags,
      content: row.content,
      summary: row.summary,
      created_at: row.created_at,
    };
  }
}

interface MeetingRow {
  id: number;
  title: string;
  date: string;
  participants: string;
  tags: string;
  content: string;
  summary: string | null;
  created_at: string;
}
