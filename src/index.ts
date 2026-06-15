/**
 * Main entry point for the Meeting Notes MCP Server
 * Supports both stdio (default) and HTTP transports.
 * Set MCP_HTTP_PORT env var to enable HTTP mode.
 */

import { startServer } from './server.js';
import { startHttpServer } from './http-server.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  if (process.env.MCP_HTTP_PORT) {
    await startHttpServer();
  } else {
    await startServer();
  }
}

main().catch((error) => {
  logger.error('Fatal server error', { error: String(error) });
  process.exit(1);
});

