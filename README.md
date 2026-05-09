# <img src="logo.png" alt="Unlinked logo" width="40" /> Unlinked

  Bring your LinkedIn professional profile into AI assistants — without copy-pasting, scraping, or guessing.

---

Unlinked is a TypeScript MCP server that connects your LinkedIn professional profile and experience to any [Model Context Protocol](https://modelcontextprotocol.io/) client — Claude Desktop, GitHub Copilot, and others. It reads your data directly from LinkedIn's official [Member Data Portability API](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/), so your assistant always has accurate, up-to-date context about who you are professionally.

> :eu: **EEA / Switzerland only.** LinkedIn's Member Data Portability API is currently available exclusively to members located in the European Economic Area and Switzerland. Thank you, Digital Markets Act (DMA)!

## What it does

Once connected, your AI assistant can:

- **Read your full professional profile** — positions, education, skills, certifications, projects, languages, honours, publications, patents, and more
- **Fetch any specific LinkedIn data domain** by name
- **Poll for recent profile changes** via the LinkedIn changelog API
- **Diagnose authorization status** so you can quickly identify consent or permission issues

All data access is read-only. Your access token is used only to talk to LinkedIn and is never stored, logged, or echoed back.

## Prerequisites

- Node.js 18+
- A LinkedIn Developer app with the **Member Data Portability API (Member)** product enabled (follow [this guide](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/?view=li-dma-data-portability-2025-11))
- A [member access token](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/?view=li-dma-data-portability-2025-11#getting-an-access-token) from the LinkedIn OAuth Token Generator (requires EEA/Switzerland membership)

## Quickstart with Claude Desktop

Add Unlinked to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "unlinked": {
      "command": "npx",
      "args": ["-y", "@larsbaunwall/unlinked"],
      "env": {
        "LINKEDIN_AUTHORIZATION": "<your_access_token>"
      }
    }
  }
}
```

## Quickstart with GitHub Copilot (VS Code)

Add to your workspace `.vscode/mcp.json` (or user-level MCP config):

```json
{
  "servers": {
    "unlinked": {
      "command": "npx",
      "args": ["-y", "@larsbaunwall/unlinked"],
      "env": {
        "LINKEDIN_AUTHORIZATION": "<your_access_token>"
      }
    }
  }
}
```

## Tools

| Tool | Description |
| --- | --- |
| `linkedin_get_profile` | Fetches and combines core professional snapshot domains: profile, positions, education, skills, certifications, and projects |
| `linkedin_get_snapshot_domain` | Fetches one explicit case-sensitive snapshot domain (e.g. `LANGUAGES`, `PATENTS`) with pagination |
| `linkedin_get_changelog` | Fetches recent changelog events since an optional epoch-ms `startTime`; returns `nextStartTime` for polling |
| `linkedin_get_authorization_status` | Checks member/application authorization status to help diagnose changelog consent issues |

## Configuration

| Environment variable | Required | Description |
| --- | --- | --- |
| `LINKEDIN_AUTHORIZATION` | Yes | LinkedIn access token. Accepts `Bearer <token>` or a bare token. |
| `LINKEDIN_API_VERSION` | No | API version in `YYYYMM` format. Defaults to `202312`. |

## Run locally

```bash
npm install
npm run build
npm start
```

The local HTTP MCP endpoint is `http://127.0.0.1:3000/mcp` by default (via `npm run start:http`). Override with `UNLINKED_HTTP_HOST` and `UNLINKED_HTTP_PORT`.

## Test with MCP Inspector

```bash
npm run build
npm run start:http   # in one terminal
npm run inspect:http # in another terminal
```

In the Inspector sidebar, use `Streamable HTTP`, set the URL to `http://localhost:3000/mcp`, set the auth header name to `Authorization`, and enter `Bearer <access_token>`. Tool discovery works without a valid token; LinkedIn API calls require a valid EEA/Switzerland portability token.

## Development

```bash
npm run dev
```

See [AGENTS.md](AGENTS.md) for implementation guidance and [.agents/skills/linkedin-member-data-portability/SKILL.md](.agents/skills/linkedin-member-data-portability/SKILL.md) for LinkedIn API details.

## License

ISC
