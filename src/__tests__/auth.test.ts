/**
 * Authentication Tests (Phase 4)
 *
 * Verifies:
 *  - Token generation endpoint (/auth/token)
 *  - JWT verification and Bearer token parsing
 *  - Auth middleware on protected MCP endpoints
 *  - Backward compatibility when auth is disabled
 */

// ── Mocks ─────────────────────────────────────────────────────────

jest.mock('jose', () => ({
  SignJWT: class SignJWT {
    constructor(private payload: Record<string, unknown>) {}
    setProtectedHeader() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(this.payload)).toString('base64url');
      return `${header}.${payload}.mocksignature`;
    }
  },
  jwtVerify: jest.fn().mockImplementation(async (token: string) => {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token');
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return { payload };
  }),
}));

jest.mock('../config/index.js', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────

import request from 'supertest';
import { createHttpApp } from '../http-server.js';
import { createToken } from '../auth/token.js';

// ── Helpers ───────────────────────────────────────────────────────

function getConfigMock() {
  return jest.requireMock('../config/index.js').getConfig as jest.Mock;
}

function authEnabledConfig() {
  return {
    openRouterApiKey: 'test-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
    mcpUsername: 'testuser',
    mcpPassword: 'testpass',
    jwtSecret: 'test-secret-key-at-least-32-characters-long!!!',
  };
}

function authDisabledConfig() {
  return {
    openRouterApiKey: 'test-key',
    databasePath: ':memory:',
    embeddingModel: 'openai/text-embedding-3-small',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    maxContextMeetings: 5,
    mcpUsername: undefined,
    mcpPassword: undefined,
    jwtSecret: undefined,
  };
}

// ── Test Suite ────────────────────────────────────────────────────

describe('Authentication (Phase 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 4.2 Token Generation — Valid Credentials ──────────────────
  describe('POST /auth/token', () => {
    it('4.2 should return 200 and a JWT token with sub matching username', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/auth/token')
        .send({ username: 'testuser', password: 'testpass' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');

      // Decode payload and verify subject
      const token = response.body.token;
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.sub).toBe('testuser');
    });

    // ── 4.3 Token Generation — Invalid Credentials ──────────────
    it('4.3 should return 401 with invalid credentials', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/auth/token')
        .send({ username: 'wronguser', password: 'wrongpass' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('invalid credentials');
    });

    // ── 4.4 Token Generation — Missing Fields ───────────────────
    it('4.4 should return 401 when username is missing', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/auth/token')
        .send({ password: 'testpass' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('missing username or password');
    });

    it('4.4 should return 401 when password is missing', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/auth/token')
        .send({ username: 'testuser' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('missing username or password');
    });

    it('4.4 should return 401 when body is empty', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/auth/token')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('missing username or password');
    });
  });

  // ── 4.5–4.7 Protected MCP Endpoints ───────────────────────────
  describe('Protected MCP endpoints', () => {
    it('4.5 should return 401 without Authorization header', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/mcp')
        .send({});

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body.error).toContain('Unauthorized');
    });

    it('4.5 should return 401 with WWW-Authenticate on GET /mcp', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app).get('/mcp');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it('4.5 should return 401 with WWW-Authenticate on DELETE /mcp', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app).delete('/mcp');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it('4.6 should return 401 with an invalid token', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body.error).toContain('invalid or expired token');
    });

    it('4.6 should return 401 with a malformed Bearer prefix', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('missing or invalid Authorization header');
    });

    it('4.7 should allow access with a valid token (GET /mcp returns 400 for missing session, not 401)', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();
      const validToken = await createToken('testuser');

      const response = await request(app)
        .get('/mcp')
        .set('Authorization', `Bearer ${validToken}`);

      // Auth passed; the endpoint itself returns 400 because session ID is missing
      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid or missing session ID');
    });

    it('4.7 should allow access with a valid token (DELETE /mcp returns 400 for missing session, not 401)', async () => {
      getConfigMock().mockReturnValue(authEnabledConfig());

      const { app } = createHttpApp();
      const validToken = await createToken('testuser');

      const response = await request(app)
        .delete('/mcp')
        .set('Authorization', `Bearer ${validToken}`);

      // Auth passed; the endpoint itself returns 400 because session ID is missing
      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid or missing session ID');
    });
  });

  // ── 4.8 Backward Compatibility ────────────────────────────────
  describe('Backward compatibility (auth disabled)', () => {
    it('4.8 should allow POST /mcp without Authorization header when auth is disabled', async () => {
      getConfigMock().mockReturnValue(authDisabledConfig());

      const { app } = createHttpApp();

      const response = await request(app)
        .post('/mcp')
        .send({});

      // Should NOT be 401 — reaches the handler and gets 400 (no session / invalid body)
      expect(response.status).not.toBe(401);
      expect(response.status).toBe(400);
    });

    it('4.8 should allow GET /mcp without Authorization header when auth is disabled', async () => {
      getConfigMock().mockReturnValue(authDisabledConfig());

      const { app } = createHttpApp();

      const response = await request(app).get('/mcp');

      expect(response.status).not.toBe(401);
      expect(response.status).toBe(400);
    });

    it('4.8 should allow DELETE /mcp without Authorization header when auth is disabled', async () => {
      getConfigMock().mockReturnValue(authDisabledConfig());

      const { app } = createHttpApp();

      const response = await request(app).delete('/mcp');

      expect(response.status).not.toBe(401);
      expect(response.status).toBe(400);
    });
  });
});
