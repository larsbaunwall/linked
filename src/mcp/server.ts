import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { LinkedInClient } from "../linkedin/client.js";
import { readLinkedInRuntimeConfig, type LinkedInRuntimeConfig } from "../linkedin/config.js";
import { registerLinkedInTools } from "../tools/linkedin.js";

export type CreateUnlinkedServerOptions = {
  linkedInClient?: LinkedInClient;
  linkedInConfig?: LinkedInRuntimeConfig;
};

export function createUnlinkedServer({
  linkedInClient,
  linkedInConfig = readLinkedInRuntimeConfig(),
}: CreateUnlinkedServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "unlinked-mcp-server",
    version: "1.0.2",
  });

  registerLinkedInTools(server, { client: linkedInClient, config: linkedInConfig });

  return server;
}