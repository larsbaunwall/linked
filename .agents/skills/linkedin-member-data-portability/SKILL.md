---
name: linkedin-member-data-portability
description: "Use when: implementing, reviewing, or documenting LinkedIn Member Data Portability API calls for the Unlinked MCP server, including snapshot domains, changelog events, access-token handling, EEA availability, and read-only profile data tools."
---

# LinkedIn Member Data Portability API

Use this skill whenever you implement or review LinkedIn API behavior for Unlinked.

## Product Context

Unlinked uses LinkedIn's **Member Data Portability (Member)** API product. The purpose is to let a LinkedIn member connect their own professional profile and experience data to an AI assistant through a local MCP server. The API is read-only for this project.

This API product exists for DMA data portability and is currently available only to LinkedIn members located in the European Economic Area and Switzerland. User-facing setup and error messages should say this plainly.

## Access And Tokens

- A LinkedIn Developer application must be provisioned with **Member Data Portability API (Member)**.
- LinkedIn's OAuth Token Generator docs currently instruct users to request `r_dma_portability_self_serve` for member self-serve access.
- Snapshot and changelog docs also reference `r_dma_portability_member` and `r_dma_portability_3rd_party` permissions. Treat 403 responses as likely product/scope/consent problems and explain that clearly.
- MCP clients should provide the access token as secret tool input for stdio usage. The server should send it only as `Authorization: Bearer <access_token>` to LinkedIn.
- Never store, log, return, or include access tokens in thrown errors.

## Required Headers

Every LinkedIn REST call should include:

```http
Authorization: Bearer <access_token>
Linkedin-Version: <YYYYMM>
Content-Type: application/json
```

Use the exact header name `Linkedin-Version`. Make the version configurable where useful. The changelog docs mention `202312`, while the current documentation version is `2025-11`; verify the latest supported version before changing defaults.

## Snapshot API

Use the Snapshot API for profile and professional-history data.

```http
GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria
GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria&domain=PROFILE
```

The optional `domain` query parameter is case-sensitive. If omitted, LinkedIn may return all domains. Prefer explicit domains for predictable assistant-facing tools.

Important response behavior:

- `elements` contains snapshot records with `snapshotDomain` and `snapshotData`.
- `snapshotData` is a list of data generated for the requested domain.
- Responses can be paginated with `paging.links` entries whose `rel` is `next` or `prev`.
- Do not trust `paging.total` as a complete page count; the docs say offline systems can make it incomplete.
- Follow next links until there is no next page or until a user-provided safety limit is reached.

Professional-context domains to prioritize:

- `PROFILE`: basic biographical profile information.
- `POSITIONS`: job roles, companies, titles, descriptions, locations, and dates.
- `EDUCATION`: schools, dates, degrees, and activities.
- `SKILLS`: skills added to the member profile.
- `CERTIFICATIONS`: certifications on the profile.
- `PROJECTS`: projects listed on the profile.
- `LANGUAGES`: languages and proficiency.
- `HONORS`: honors listed on the profile.
- `COURSES`: courses listed on the profile.
- `PUBLICATIONS`: publications listed on the profile.
- `PATENTS`: patents listed on the profile.
- `ORGANIZATIONS`: organizations listed on the profile.
- `VOLUNTEERING_EXPERIENCES`: volunteering roles and descriptions.
- `RECOMMENDATIONS`: recommendations received and given.

Other useful domains include `CONNECTIONS`, `MEMBER_SHARE_INFO`, `ARTICLES`, `ALL_COMMENTS`, `ALL_LIKES`, `JOB_APPLICATIONS`, `JOB_POSTINGS`, `SAVED_JOBS`, `JOB_SEEKER_PREFERENCES`, and `PROFILE_SUMMARY`. Be thoughtful before exposing broad activity or inbox-like domains by default because they may contain sensitive personal data.

## Changelog API

Use the Changelog API for recent post-consent activity events.

```http
GET https://api.linkedin.com/rest/memberChangeLogs?q=memberAndApplication
GET https://api.linkedin.com/rest/memberChangeLogs?q=memberAndApplication&startTime=<epoch_ms>&count=10
```

Behavior to preserve:

- Events are available for up to the past 28 days.
- `startTime` is an inclusive epoch-millisecond timestamp.
- Invalid timestamps return `400`.
- The docs recommend `count=10`; the upper limit is `50`.
- Use the latest returned `processedAt` as the next `startTime` cursor. If no event is returned, keep the same cursor for the next poll.
- `capturedAt` is the recommended event activity time when embedded activity timestamps are missing.
- Changelog records include fields such as `id`, `capturedAt`, `processedAt`, `owner`, `actor`, `resourceName`, `resourceId`, `resourceUri`, `method`, `activity`, `processedActivity`, `activityId`, and `activityStatus`.
- For archiving-style outputs, the docs recommend preserving `method`, `resourceName`, `resourceId`, and `processedActivity`.

## Authorization Status API

The changelog management API can check whether changelog generation is active:

```http
GET https://api.linkedin.com/rest/memberAuthorizations?q=memberAndApplication
```

There is also a documented activation endpoint:

```http
POST https://api.linkedin.com/rest/memberAuthorizations
Content-Type: application/json

{}
```

Unlinked should stay read-only by default. Do not add the POST activation behavior unless the project explicitly decides that this consent-management call is acceptable and documents it as separate from LinkedIn profile data mutation.

## Error Handling

LinkedIn error bodies typically contain:

```json
{
  "message": "Empty oauth2_access_token",
  "serviceErrorCode": 401,
  "status": 401
}
```

Map common failures into helpful MCP errors:

- `400`: invalid query, timestamp, count, domain, or request syntax.
- `401`: missing, expired, revoked, invalid, or malformed bearer token.
- `403`: application lacks product access, scope, or member consent.
- `404`: endpoint or restricted API issue.
- `426`: API version header is deprecated.
- `429`: rate limit; reduce duplicate calls and retry later.
- `500` or `504`: LinkedIn-side failure or timeout; include request id headers when available, but never include tokens.

## MCP Implementation Notes

- Use `McpServer` and `StdioServerTransport` from `@modelcontextprotocol/sdk`.
- Use Zod schemas for inputs, including exact domain validation when practical.
- Return both human-readable `content` and machine-readable `structuredContent` for profile and changelog tools.
- Write diagnostics to stderr only. stdout belongs to the MCP transport.
- Keep the token in memory for the duration of a single tool call.
- Prefer explicit, narrow tools over one broad tool that fetches all LinkedIn data by default.
