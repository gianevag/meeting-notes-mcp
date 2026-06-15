/**
 * Embedding Service
 * Converts text to vector arrays using OpenRouter API
 * Stores and retrieves embeddings from sqlite-vec
 */

import { getOpenRouterClient } from './openrouter.js';
import { getConfig } from '../config/index.js';
import { MeetingRepository } from '../db/meetings.js';

/**
 * Generate an embedding vector for the given text
 * Returns a Float32Array suitable for sqlite-vec storage
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const config = getConfig();
  const client = getOpenRouterClient();

  const response = await client.createEmbedding({
    model: config.embeddingModel,
    input: text,
  });

  if (!response.data || response.data.length === 0) {
    throw new Error('No embedding data returned from OpenRouter');
  }

  const embeddingArray = response.data[0].embedding;
  return new Float32Array(embeddingArray);
}

/**
 * Store an embedding for a meeting in the database
 */
export function storeEmbedding(
  repo: MeetingRepository,
  meetingId: number,
  embedding: Float32Array
): void {
  repo.saveEmbedding(meetingId, embedding);
}

/**
 * Search for meetings similar to the given text query
 * 1. Embeds the query text
 * 2. Performs vector similarity search in sqlite-vec
 * 3. Returns ranked results
 */
export async function searchSimilarMeetings(
  repo: MeetingRepository,
  query: string,
  limit: number = 5
): Promise<Array<{ meetingId: number; distance: number }>> {
  const queryEmbedding = await generateEmbedding(query);
  const results = repo.searchSimilar(queryEmbedding, limit);

  return results.map((r) => ({
    meetingId: r.meeting.id,
    distance: r.distance,
  }));
}

/**
 * Generate and store embedding for meeting content in one step
 */
export async function embedAndStoreMeeting(
  repo: MeetingRepository,
  meetingId: number,
  content: string
): Promise<Float32Array> {
  const embedding = await generateEmbedding(content);
  storeEmbedding(repo, meetingId, embedding);
  return embedding;
}
