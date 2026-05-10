import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { LinkedInApiError, LinkedInClient } from "../linkedin/client.js";
import { readLinkedInRuntimeConfig, type LinkedInRuntimeConfig } from "../linkedin/config.js";
import {
  ACTIVITY_DOMAINS,
  DEFAULT_PROFILE_DOMAINS,
  PROFILE_DOMAINS,
  SNAPSHOT_DOMAINS,
  type JsonObject,
  type ProfileSnapshotResult,
} from "../linkedin/types.js";

const maxPagesSchema = z
  .number()
  .int()
  .min(1)
  .max(25)
  .default(10)
  .describe(
    "Maximum number of LinkedIn API pages to follow. Each snapshot page contains roughly 10 records; each changelog page contains up to count records. Increase for members with extensive history; decrease to limit response size. Range: 1–25.",
  );

const readOnlyLinkedInAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const profileSnapshotOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for this request (e.g. '202312')."),
  domains: z
    .record(z.string(), z.array(z.unknown()))
    .describe("Fetched snapshot records keyed by domain name. Each value is a flat list of data items returned for that domain."),
  metadata: z
    .array(
      z.object({
        domain: z.string().describe("Domain name (e.g. 'POSITIONS')."),
        itemCount: z.number().describe("Total number of items returned across all fetched pages."),
        pageCount: z.number().describe("Number of LinkedIn API pages fetched for this domain."),
        truncated: z.boolean().describe("True if the page limit was reached before all records were fetched."),
      }),
    )
    .describe("Per-domain fetch statistics. Inspect truncated to detect partial results."),
});

const snapshotDomainOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for this request (e.g. '202312')."),
  domain: z.string().describe("The snapshot domain that was fetched (e.g. 'PROFILE')."),
  snapshotData: z
    .array(z.unknown())
    .describe("Flat list of data records extracted from snapshot elements for this domain."),
  rawElements: z
    .array(z.unknown())
    .describe("Raw snapshot element objects as returned by LinkedIn, including snapshotDomain metadata."),
  pageCount: z.number().describe("Number of LinkedIn API pages fetched."),
  truncated: z.boolean().describe("True if the page limit was reached before all records were fetched."),
});

const changelogOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for this request (e.g. '202312')."),
  events: z
    .array(z.unknown())
    .describe(
      "Changelog event objects. Each event includes a processedAt timestamp and describes a data change recorded after the member granted Data Portability consent.",
    ),
  nextStartTime: z
    .number()
    .optional()
    .describe(
      "Epoch milliseconds of the latest processedAt value seen. Pass as startTime on the next call to poll incrementally without re-fetching the same events.",
    ),
  pageCount: z.number().describe("Number of LinkedIn API pages fetched."),
  truncated: z.boolean().describe("True if the page limit was reached before all events were fetched."),
});

export type RegisterLinkedInToolsOptions = {
  client?: LinkedInClient;
  config?: LinkedInRuntimeConfig;
};

export function registerLinkedInTools(
  server: McpServer,
  { client = new LinkedInClient(), config = readLinkedInRuntimeConfig() }: RegisterLinkedInToolsOptions = {},
): void {
  server.registerTool(
    "linkedin_get_profile",
    {
      title: "Get LinkedIn professional profile",
      description:
        "Fetch the authenticated LinkedIn member's professional identity across one or more profile domains. Returns structured career history, education, skills, certifications, projects, languages, honors, courses, publications, patents, organization memberships, volunteering experience, and recommendations — whichever domains are requested.\n\nUse this tool when you need to understand who the member is professionally: their career background, qualifications, industry, or skills. For social activity data (posts, likes, connections, job applications), use linkedin_get_activity instead.\n\nRequires Member Data Portability API access. Currently available only to LinkedIn members in the European Economic Area (EEA) and Switzerland.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domains: z
          .array(z.enum(PROFILE_DOMAINS))
          .min(1)
          .max(PROFILE_DOMAINS.length)
          .default([...DEFAULT_PROFILE_DOMAINS])
          .describe(
            "Profile domains to fetch and combine. Defaults to the six core domains: PROFILE (bio and personal info), POSITIONS (job history), EDUCATION (degrees and schools), SKILLS, CERTIFICATIONS, and PROJECTS. Add LANGUAGES, HONORS, COURSES, PUBLICATIONS, PATENTS, ORGANIZATIONS, VOLUNTEERING_EXPERIENCES, RECOMMENDATIONS, or PROFILE_SUMMARY for a more complete picture.",
          ),
        maxPagesPerDomain: maxPagesSchema,
      }),
      outputSchema: profileSnapshotOutputSchema,
    },
    async ({ domains, maxPagesPerDomain }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const profile = await client.getProfile({ accessToken, apiVersion, domains, maxPagesPerDomain });
        return makeSuccessResult(formatProfileSummary(profile), profile);
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_get_activity",
    {
      title: "Get LinkedIn activity data",
      description:
        "Fetch the authenticated LinkedIn member's social activity and job-related data across one or more activity domains. Covers professional network connections, shared posts, published articles, comments, likes, job applications, job postings, saved jobs, and job-seeker preferences.\n\nUse this tool when you need to understand the member's LinkedIn behaviour, job-search activity, or professional network. These domains can contain large volumes of records — prefer requesting specific domains rather than all to limit response size. For biographical profile data (career history, education, skills), use linkedin_get_profile instead.\n\nRequires Member Data Portability API access. Currently available only to LinkedIn members in the European Economic Area (EEA) and Switzerland.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domains: z
          .array(z.enum(ACTIVITY_DOMAINS))
          .min(1)
          .max(ACTIVITY_DOMAINS.length)
          .default([...ACTIVITY_DOMAINS])
          .describe(
            "Activity domains to fetch and combine. Defaults to all activity domains. CONNECTIONS — professional network contacts. MEMBER_SHARE_INFO — shared posts. ARTICLES — published articles. ALL_COMMENTS — comments left on content. ALL_LIKES — content the member has liked. JOB_APPLICATIONS — jobs applied to. JOB_POSTINGS — jobs posted by the member. SAVED_JOBS — bookmarked job listings. JOB_SEEKER_PREFERENCES — job search preferences. Prefer selecting specific domains to limit response size.",
          ),
        maxPagesPerDomain: maxPagesSchema,
      }),
      outputSchema: profileSnapshotOutputSchema,
    },
    async ({ domains, maxPagesPerDomain }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const activity = await client.getProfile({ accessToken, apiVersion, domains, maxPagesPerDomain });
        return makeSuccessResult(formatProfileSummary(activity), activity);
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_get_snapshot_domain",
    {
      title: "Get single LinkedIn snapshot domain",
      description:
        "Fetch the raw LinkedIn snapshot data for a single, precisely-named domain. Returns all paginated records up to the safety page limit, plus the raw LinkedIn API elements.\n\nUse this tool when you need a domain not covered by linkedin_get_profile or linkedin_get_activity, or when you need the full raw LinkedIn API elements (including snapshotDomain metadata) for a specific domain. Domain names are case-sensitive.\n\nRequires Member Data Portability API access. Currently available only to LinkedIn members in the European Economic Area (EEA) and Switzerland.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domain: z
          .enum(SNAPSHOT_DOMAINS)
          .describe(
            "Case-sensitive LinkedIn snapshot domain name. Profile domains: PROFILE, PROFILE_SUMMARY, POSITIONS, EDUCATION, SKILLS, CERTIFICATIONS, PROJECTS, ORGANIZATIONS, LANGUAGES, HONORS, COURSES, PUBLICATIONS, PATENTS, VOLUNTEERING_EXPERIENCES, RECOMMENDATIONS. Activity domains: CONNECTIONS, MEMBER_SHARE_INFO, ARTICLES, ALL_COMMENTS, ALL_LIKES, JOB_APPLICATIONS, JOB_POSTINGS, SAVED_JOBS, JOB_SEEKER_PREFERENCES.",
          ),
        maxPages: maxPagesSchema,
      }),
      outputSchema: snapshotDomainOutputSchema,
    },
    async ({ domain, maxPages }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const result = await client.getSnapshotDomain({ accessToken, apiVersion, domain, maxPages });
        return makeSuccessResult(`Fetched ${result.snapshotData.length} LinkedIn ${domain} snapshot item(s).`, {
          apiVersion,
          ...result,
        });
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_get_changelog",
    {
      title: "Get LinkedIn changelog events",
      description:
        "Fetch recent change events recorded by LinkedIn after the member granted Data Portability consent. Events cover the past 28 days and describe mutations to the member's profile or data (e.g. profile edits, connection changes).\n\nUse this tool for monitoring recent LinkedIn activity or polling for data changes since a last-known timestamp. Call it repeatedly using nextStartTime as the next startTime to poll incrementally. If no events appear, call linkedin_get_authorization_status first to verify that member consent is active.\n\nRequires Member Data Portability API access. Currently available only to LinkedIn members in the European Economic Area (EEA) and Switzerland.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        startTime: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Epoch milliseconds (Unix timestamp × 1000) for the start of the time window. Only events with processedAt at or after this time are returned. Omit on the first call to retrieve the most recent events. On subsequent polls, pass the nextStartTime value from the previous response.",
          ),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe(
            "Number of changelog events to request per LinkedIn API page. LinkedIn's maximum is 50. Use smaller values for lighter responses; larger values to catch up after long polling gaps.",
          ),
        maxPages: maxPagesSchema,
      }),
      outputSchema: changelogOutputSchema,
    },
    async ({ startTime, count, maxPages }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const changelog = await client.getChangelog({ accessToken, apiVersion, startTime, count, maxPages });
        return makeSuccessResult(`Fetched ${changelog.events.length} LinkedIn changelog event(s).`, changelog);
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_get_authorization_status",
    {
      title: "Check LinkedIn Data Portability consent",
      description:
        "Check whether the authenticated LinkedIn member has granted Data Portability consent for this developer application. Returns the current member authorization state.\n\nUse this diagnostic tool when linkedin_get_changelog returns no events or when changelog access seems broken — active member consent must be established before changelog events are generated. A 403 response typically indicates missing consent or an incorrectly provisioned developer application.\n\nRequires Member Data Portability API access. Currently available only to LinkedIn members in the European Economic Area (EEA) and Switzerland.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({}),
    },
    async (_args) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const authorizationStatus = await client.getAuthorizationStatus({ accessToken, apiVersion });
        return makeSuccessResult("Fetched LinkedIn member authorization status.", authorizationStatus);
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );
}

function resolveLinkedInAuth(config: LinkedInRuntimeConfig) {
  return {
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
  };
}

function formatProfileSummary(profile: ProfileSnapshotResult): string {
  const summary = profile.metadata.map((metadata) => `${metadata.domain}: ${metadata.itemCount}`).join(", ");
  return `Fetched LinkedIn profile snapshot domains (${summary}).`;
}

function makeSuccessResult(text: string, structuredContent: JsonObject) {
  return {
    content: [{ type: "text" as const, text: text + "\n\n" + JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function makeErrorResult(error: unknown) {
  const message = getErrorMessage(error);
  const structuredContent: JsonObject = { error: message };

  if (error instanceof LinkedInApiError) {
    structuredContent.status = error.status;
    structuredContent.serviceErrorCode = error.serviceErrorCode;
    structuredContent.requestId = error.requestId;
  }

  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    structuredContent,
    isError: true,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}