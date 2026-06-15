/**
 * MCP Streamable HTTP Server
 * Runs the Meeting Notes MCP server over HTTP for remote access.
 */

import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/logger.js';
import { getConfig } from './config/index.js';
import { createToken } from './auth/token.js';
import { requireAuth } from './auth/middleware.js';

/**
 * Create the Express application with all MCP HTTP routes configured.
 * Returns both the app and the transports map for session management.
 */
export function createHttpApp(): {
  app: express.Application;
  transports: Map<string, StreamableHTTPServerTransport>;
} {
  const app = createMcpExpressApp({ host: '0.0.0.0' });
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // POST /auth/token — obtain a JWT by providing username/password
  app.post('/auth/token', async (req, res) => {
    try {
      const config = getConfig();
      const body = req.body as Record<string, unknown>;

      if (!body || typeof body !== 'object') {
        res.status(401).json({ error: 'Unauthorized: invalid request body' });
        return;
      }

      const { username, password } = body;

      if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        !username ||
        !password
      ) {
        res.status(401).json({ error: 'Unauthorized: missing username or password' });
        return;
      }

      if (
        !config.mcpUsername ||
        !config.mcpPassword ||
        username !== config.mcpUsername ||
        password !== config.mcpPassword
      ) {
        res.status(401).json({ error: 'Unauthorized: invalid credentials' });
        return;
      }

      const token = await createToken(username);
      res.status(200).json({ token });
    } catch (error) {
      logger.error('Error handling /auth/token request', { error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST /mcp — JSON-RPC requests
  app.post('/mcp', requireAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (
        !sessionId &&
        req.body &&
        typeof req.body === 'object' &&
        req.body.method === 'initialize'
      ) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
            logger.info(`MCP session initialized: ${sid}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
            logger.info(`MCP session closed: ${sid}`);
          }
        };

        const server = new McpServer({
          name: 'meeting-notes-mcp',
          version: '1.0.0',
        });
        registerTools(server);

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP POST request', { error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream
  app.get('/mcp', requireAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error('Error handling MCP GET request', { error: String(error) });
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', requireAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error('Error handling MCP DELETE request', { error: String(error) });
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  return { app, transports };
}

export async function startHttpServer(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || '3000', 10);
  const { app, transports } = createHttpApp();

  const serverInstance = app.listen(port, '0.0.0.0', () => {
    logger.info(
      `Meeting Notes MCP HTTP Server listening on http://0.0.0.0:${port}/mcp`
    );
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down MCP HTTP server...');
    serverInstance.close(() => {
      logger.info('HTTP server closed');
    });

    for (const [sid, transport] of transports) {
      try {
        await transport.close();
      } catch (error) {
        logger.error(`Error closing transport ${sid}`, { error: String(error) });
      }
    }
  };

  process.on('SIGINT', () => {
    shutdown().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown().then(() => process.exit(0));
  });
}
