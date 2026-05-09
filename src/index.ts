#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readLinkedInRuntimeConfig } from "./linkedin/config.js";
import { createUnlinkedServer } from "./mcp/server.js";

let config;
try {
  config = readLinkedInRuntimeConfig();
} catch (error) {
  console.error(`[unlinked] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const server = createUnlinkedServer({ linkedInConfig: config });
const transport = new StdioServerTransport();

await server.connect(transport);
