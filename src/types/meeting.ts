/**
 * Type definitions for the Meeting Notes MCP Server
 */

export interface Meeting {
  id: number;
  title: string;
  date: string;
  participants: string;
  tags: string;
  content: string;
  summary: string | null;
  created_at: string;
}

export interface MeetingInput {
  title: string;
  date: string;
  participants: string[];
  tags: string[];
  content: string;
}

export interface MeetingEmbedding {
  meeting_id: number;
  embedding: Float32Array;
}

export interface MeetingFilters {
  startDate?: string;
  endDate?: string;
  participant?: string;
  tag?: string;
}

export interface SearchResult {
  meeting: Meeting;
  distance: number;
}

export interface SummaryStyle {
  style: 'brief' | 'detailed' | 'bullets';
}

/**
 * Configuration for the application
 */
export interface AppConfig {
  openRouterApiKey: string;
  databasePath: string;
  embeddingModel: string;
  chatModel: string;
  maxContextMeetings: number;
  mcpUsername?: string;
  mcpPassword?: string;
  jwtSecret?: string;
}
