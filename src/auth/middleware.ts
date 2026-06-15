/**
 * Express authentication middleware
 * Conditionally requires a valid Bearer JWT token when auth is configured.
 */

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/index.js';
import { verifyToken } from './token.js';

/**
 * Express middleware that checks for a valid Bearer JWT token.
 *
 * - If auth env vars (MCP_USERNAME, MCP_PASSWORD, JWT_SECRET) are not all
 *   configured, auth is disabled and the middleware calls next() immediately.
 * - Otherwise, it requires an `Authorization: Bearer <token>` header.
 * - On valid token, calls next().
 * - On missing/invalid token, responds 401 with JSON error and
 *   `WWW-Authenticate: Bearer` header.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const config = getConfig();

  // Authentication is disabled when any auth env var is missing
  if (!config.mcpUsername || !config.mcpPassword || !config.jwtSecret) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ error: 'Unauthorized: missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);
  const payload = await verifyToken(token);

  if (!payload) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ error: 'Unauthorized: invalid or expired token' });
    return;
  }

  // Attach decoded payload to request for downstream use
  (req as unknown as Record<string, unknown>).authPayload = payload;

  next();
}
