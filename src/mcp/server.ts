import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";

import type { LinkedInClient } from "../linkedin/client.js";
import { readLinkedInRuntimeConfig, type LinkedInRuntimeConfig } from "../linkedin/config.js";
import { registerLinkedInTools } from "../tools/linkedin.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../../package.json") as { version: string };

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
    version: SERVER_VERSION,
  });

  registerLinkedInTools(server, { client: linkedInClient, config: linkedInConfig });

  return server;
}