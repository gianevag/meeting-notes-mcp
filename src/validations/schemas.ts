/**
 * Zod validation schemas for all MCP tool parameters
 * Provides clear error messages for invalid inputs
 */

import { z } from 'zod';

// ── Shared helpers ────────────────────────────────────────────────

const isoDate = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  { message: 'Date must be in YYYY-MM-DD format' }
);

const nonEmptyString = z.string().min(1, { message: 'String cannot be empty' });

// ── Tool Input Schemas ────────────────────────────────────────────

/**
 * add_meeting tool parameters
 */
export const AddMeetingSchema = z.object({
  title: nonEmptyString.max(500, { message: 'Title must be 500 characters or less' }),
  date: isoDate,
  participants: z.array(nonEmptyString).min(1, { message: 'At least one participant is required' }),
  tags: z.array(z.string()).default([]),
  content: nonEmptyString.min(10, { message: 'Content must be at least 10 characters' }),
});

export type AddMeetingInput = z.infer<typeof AddMeetingSchema>;

/**
 * get_meeting tool parameters
 */
export const GetMeetingSchema = z.object({
  id: z.number().int().positive({ message: 'Meeting ID must be a positive integer' }),
});

export type GetMeetingInput = z.infer<typeof GetMeetingSchema>;

/**
 * list_meetings tool parameters
 */
export const ListMeetingsSchema = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  participant: z.string().optional(),
  tag: z.string().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  }
);

export type ListMeetingsInput = z.infer<typeof ListMeetingsSchema>;

/**
 * search_meetings tool parameters
 */
export const SearchMeetingsSchema = z.object({
  query: nonEmptyString.max(2000, { message: 'Query must be 2000 characters or less' }),
  limit: z.number().int().min(1).max(20).default(5),
});

export type SearchMeetingsInput = z.infer<typeof SearchMeetingsSchema>;

/**
 * summarize_meeting tool parameters
 */
export const SummarizeMeetingSchema = z.object({
  id: z.number().int().positive({ message: 'Meeting ID must be a positive integer' }),
  style: z.enum(['brief', 'detailed', 'bullets']).default('brief'),
});

export type SummarizeMeetingInput = z.infer<typeof SummarizeMeetingSchema>;

/**
 * ask_meetings tool parameters
 */
export const AskMeetingsSchema = z.object({
  question: nonEmptyString.max(2000, { message: 'Question must be 2000 characters or less' }),
  maxMeetings: z.number().int().min(1).max(10).optional(),
});

export type AskMeetingsInput = z.infer<typeof AskMeetingsSchema>;

// ── Validation helper ─────────────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate input against a Zod schema
 * Returns a structured result with either the parsed data or error messages
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((err) =>
    err.path.length > 0 ? `${err.path.join('.')}: ${err.message}` : err.message
  );

  return { success: false, errors };
}

/**
 * Validate input and throw a formatted error if invalid
 * Use this when you want errors to bubble up to the caller
 */
export function validateInputOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = validateInput(schema, input);

  if (!result.success) {
    throw new Error(`Validation failed: ${result.errors!.join('; ')}`);
  }

  return result.data!;
}
