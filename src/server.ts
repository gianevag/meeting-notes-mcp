/**
 * MCP Server initialization and startup
 * Creates the McpServer, registers tools, and connects stdio transport
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/logger.js';

/**
 * Create and configure a new McpServer instance with all tools registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'meeting-notes-mcp',
    version: '1.0.0',
  });

  registerTools(server);

  logger.info('MCP server created with tools registered');

  return server;
}

/**
 * Start the MCP server on stdio transport.
 * This is the production entry point.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('Meeting Notes MCP Server running on stdio');
}
