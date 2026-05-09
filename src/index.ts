#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createUnlinkedServer } from "./mcp/server.js";

const server = createUnlinkedServer();
const transport = new StdioServerTransport();

await server.connect(transport);
