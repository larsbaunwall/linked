# AGENTS.md

## Project Purpose

This repository is **Unlinked**, a TypeScript MCP server that connects a user's LinkedIn professional profile and experience data to AI assistants such as Claude Desktop, GitHub Copilot, and other Model Context Protocol clients.

Unlinked exists to let a member bring their own professional context into an assistant without making the assistant scrape LinkedIn, infer profile details, or rely on stale manually copied text. The LinkedIn API surface used here is read-only.

## Core Requirements

- Build the server with the official TypeScript MCP SDK, `@modelcontextprotocol/sdk`.
- Run the MCP server from the CLI over stdio with `StdioServerTransport`.
- Provide a local Streamable HTTP entry point for MCP Inspector and HTTP clients that need connection headers.
- Keep the project usable by desktop MCP clients, especially Claude Desktop and GitHub Copilot.
- Connect to LinkedIn's Member Data Portability (Member) API product.
- Fetch LinkedIn member profile and professional-history data for the authenticated member.
- Treat the LinkedIn access token as connection/startup secret input. For HTTP MCP transports, read it from `Authorization: Bearer <access_token>` request metadata. For stdio, read the equivalent value from `LINKEDIN_TOKEN`. Use it only to send `Authorization: Bearer <access_token>` to LinkedIn. Do not persist it, log it, echo it into MCP responses, or put it in package scripts.
- Make clear in user-facing docs and errors that the Member Data Portability product is currently available only to LinkedIn members in the European Economic Area and Switzerland.
- Preserve the API's read-only nature. Do not add tools that mutate LinkedIn data.

## LinkedIn API Notes

The main documentation is LinkedIn's Microsoft Learn page for [Member Data Portability (Member)](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/?view=li-dma-data-portability-2025-11).

Before implementing or changing LinkedIn API behavior, also read the local skill at `.agents/skills/linkedin-member-data-portability/SKILL.md`.

Important behavior from the docs:

- Access requires a LinkedIn Developer application provisioned with the **Member Data Portability API (Member)** product.
- The OAuth Token Generator flow is currently available only to members located in the EEA and Switzerland.
- The token generator documentation currently instructs members to request the `r_dma_portability_self_serve` scope. The Snapshot and Changelog API pages also describe DMA portability permissions such as `r_dma_portability_member` and `r_dma_portability_3rd_party`. Follow the current docs and surface authorization failures clearly.
- The LinkedIn API version is configured with `LINKEDIN_API_VERSION` and defaults to `202312` when unset. The value must be in `YYYYMM` format (e.g. `202312`, `202501`). Do not use `v2` or any other non-date format.
- Snapshot data is fetched with `GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria` and optional `domain` query parameter.
- Professional profile domains to prioritize include `PROFILE`, `POSITIONS`, `EDUCATION`, `SKILLS`, `CERTIFICATIONS`, `PROJECTS`, `ORGANIZATIONS`, `LANGUAGES`, `HONORS`, `COURSES`, `PUBLICATIONS`, `PATENTS`, `VOLUNTEERING_EXPERIENCES`, and `RECOMMENDATIONS`.
- Snapshot responses may be paginated. Follow `paging.links` until no next page remains, and account for the docs' warning that `paging.total` may not fully reflect all pages.
- Changelog events are fetched with `GET https://api.linkedin.com/rest/memberChangeLogs?q=memberAndApplication`. They cover events generated after member consent and are currently limited to the past 28 days.
- Changelog polling should support `startTime`, use the latest returned `processedAt` as the next cursor, default to modest page sizes, and respect the documented upper `count` limit of 50.
- LinkedIn errors use standard HTTP status codes and JSON bodies with `message`, `serviceErrorCode`, and `status`. Return helpful MCP errors without leaking tokens.

## MCP Design Guidance

- Prefer small, explicit tools with Zod input schemas and clear descriptions.
- Return useful `structuredContent` where practical so assistants can reliably consume profile data.
- Keep raw data available enough for transparency, but shape common outputs around professional profile context.
- Use tool inputs for request-shaping values such as requested domains, pagination limits, and start time. Do not require access tokens or API versions as per-tool inputs.
- Use `LINKEDIN_TOKEN` for stdio token configuration because stdio has no HTTP authorization header. Do not put tokens in package scripts.
- Use the Inspector's HTTP Authorization header for LinkedIn API calls when testing through the local Streamable HTTP endpoint.
- Do not write to stdout except through the MCP stdio transport. Diagnostic logs must go to stderr.

Useful initial tools:

- `linkedin_get_profile`: fetch and combine core professional snapshot domains such as profile, positions, education, skills, certifications, and projects.
- `linkedin_get_snapshot_domain`: fetch one explicit snapshot domain by exact case-sensitive domain name.
- `linkedin_get_changelog`: fetch recent changelog events since an optional `startTime`.
- `linkedin_get_authorization_status`: query `memberAuthorizations` to help users diagnose whether changelog processing is active.

## Development Workflow

- Use `npm run build` to type-check and compile.
- Use `npm run dev` for local development.
- Use `npm start` to run the compiled stdio server.
- Use `npm run start:http` to run the compiled local Streamable HTTP server at `/mcp`.
- Use `npm run inspect:http` with `npm run start:http` to test the Inspector sidebar Authorization header flow. Use `npm run inspect` after `npm run build` only for stdio discovery.
- Keep README examples short and friendly for people browsing the project on GitHub.
- Do not commit secrets, generated tokens, local MCP client config containing tokens, or captured LinkedIn member data.
