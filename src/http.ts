import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { IncomingMessage, ServerResponse } from "node:http";

import { readLinkedInRuntimeConfig } from "./linkedin/config.js";
import { createUnlinkedServer } from "./mcp/server.js";

let linkedInConfig;
try {
  linkedInConfig = readLinkedInRuntimeConfig();
} catch (error) {
  console.error(`[unlinked] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3000;
const MCP_PATH = "/mcp";

const host = process.env.UNLINKED_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;
const port = readPort(process.env.UNLINKED_HTTP_PORT) ?? readPort(process.env.PORT) ?? DEFAULT_HTTP_PORT;

const app = createMcpExpressApp({ host });

type HttpRequest = IncomingMessage & { body?: unknown };
type HttpResponse = ServerResponse & {
  headersSent: boolean;
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
};

app.post(MCP_PATH, async (request: HttpRequest, response: HttpResponse) => {
  const server = createUnlinkedServer({ linkedInConfig });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);

    response.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("Failed to handle MCP HTTP request:", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, (_request: HttpRequest, response: HttpResponse) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.delete(MCP_PATH, (_request: HttpRequest, response: HttpResponse) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

const httpServer = app.listen(port, host, () => {
  console.error(`Unlinked MCP HTTP server listening at http://${host}:${port}${MCP_PATH}`);
});

httpServer.on("error", (error: Error) => {
  console.error("Failed to start Unlinked MCP HTTP server:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});

function readPort(value: string | undefined): number | undefined {
  const portValue = Number(value);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    return undefined;
  }
  return portValue;
}