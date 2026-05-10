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

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "unlinked": {
      "command": "npx",
      "args": ["-y", "@larsbaunwall/unlinked"],
      "env": {
        "LINKEDIN_TOKEN": "<your_access_token>"
      }
    }
  }
}
```

The config file is typically at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### GitHub Copilot (VS Code)

Add to your user-level MCP config (`File → Preferences → MCP Servers`) or a workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "unlinked": {
      "command": "npx",
      "args": ["-y", "@larsbaunwall/unlinked"],
      "env": {
        "LINKEDIN_TOKEN": "<your_access_token>"
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
| `LINKEDIN_TOKEN` | Yes | LinkedIn access token. Accepts `Bearer <token>` or a bare token. |
| `LINKEDIN_API_VERSION` | No | API version in `YYYYMM` format. Defaults to `202312`. |

## Development

```bash
npm install
npm run build
npm run dev        # run directly from source with .env
npm run inspect    # test with MCP Inspector
```

See [AGENTS.md](AGENTS.md) for implementation guidance.

## License

MIT
