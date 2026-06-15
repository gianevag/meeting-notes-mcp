/**
 * JWT token creation and verification
 * Uses the jose library for HS256 signing.
 */

import { SignJWT, jwtVerify } from 'jose';
import { getConfig } from '../config/index.js';

/**
 * Create a signed JWT for the given username.
 * Returns a JWT string with sub: username and 30-day expiration.
 * Throws if JWT_SECRET is not configured.
 */
export async function createToken(username: string): Promise<string> {
  const config = getConfig();
  const secret = config.jwtSecret;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const secretKey = new TextEncoder().encode(secret);

  const jwt = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey);

  return jwt;
}

/**
 * Verify a JWT token string.
 * Returns the decoded payload on valid token.
 * Returns null on expired, malformed, or invalid-signature tokens.
 */
export async function verifyToken(token: string): Promise<unknown | null> {
  const config = getConfig();
  const secret = config.jwtSecret;
  if (!secret) {
    return null;
  }

  const secretKey = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      clockTolerance: 60,
    });
    return payload;
  } catch {
    return null;
  }
}
