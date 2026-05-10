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
  .describe("Max pages of results to fetch (1–25). Each page holds ~10 records. Lower this to keep responses small.");

const readOnlyLinkedInAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const profileSnapshotOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for the request."),
  domains: z
    .record(z.string(), z.array(z.unknown()))
    .describe("Records grouped by section name (e.g. POSITIONS, EDUCATION). Each value is the list of items in that section."),
  metadata: z
    .array(
      z.object({
        domain: z.string().describe("Section name."),
        itemCount: z.number().describe("Number of items returned."),
        pageCount: z.number().describe("Pages fetched."),
        truncated: z.boolean().describe("True if more results exist beyond the page limit."),
      }),
    )
    .describe("Per-section fetch stats. Check truncated to detect partial results."),
});

const snapshotDomainOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for the request."),
  domain: z.string().describe("The section that was fetched."),
  snapshotData: z.array(z.unknown()).describe("List of records for this section."),
  rawElements: z.array(z.unknown()).describe("Raw LinkedIn API elements (with metadata) for advanced use."),
  pageCount: z.number().describe("Pages fetched."),
  truncated: z.boolean().describe("True if more results exist beyond the page limit."),
});

const changelogOutputSchema = z.object({
  apiVersion: z.string().describe("LinkedIn API version used for the request."),
  events: z.array(z.unknown()).describe("Recent change events on the member's LinkedIn data."),
  nextStartTime: z
    .number()
    .optional()
    .describe("Pass this back as startTime on the next call to continue polling without duplicates."),
  pageCount: z.number().describe("Pages fetched."),
  truncated: z.boolean().describe("True if more results exist beyond the page limit."),
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
      title: "Get LinkedIn résumé",
      description:
        "Get the user's LinkedIn résumé: bio, work history, education, skills, certifications, projects, languages, awards, publications, and more. Use for questions about who they are professionally, their background, or qualifications.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domains: z
          .array(z.enum(PROFILE_DOMAINS))
          .min(1)
          .max(PROFILE_DOMAINS.length)
          .default([...DEFAULT_PROFILE_DOMAINS])
          .describe(
            "Sections to include. Defaults cover the core résumé: bio, work history, education, skills, certifications, projects. Add more for fuller picture: PROFILE (bio), POSITIONS (work history), EDUCATION, SKILLS, CERTIFICATIONS, PROJECTS, LANGUAGES, HONORS (awards), COURSES, PUBLICATIONS, PATENTS, ORGANIZATIONS (memberships), VOLUNTEERING_EXPERIENCES, RECOMMENDATIONS, PROFILE_SUMMARY.",
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
      title: "Get LinkedIn activity",
      description:
        "Get the user's LinkedIn social activity: connections, posts, articles, comments, likes, job applications, saved jobs, and job-search preferences. Use for questions about their network, content, or job search. Prefer specific sections — these can be large.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domains: z
          .array(z.enum(ACTIVITY_DOMAINS))
          .min(1)
          .max(ACTIVITY_DOMAINS.length)
          .default([...ACTIVITY_DOMAINS])
          .describe(
            "Sections to include. CONNECTIONS (network), MEMBER_SHARE_INFO (posts), ARTICLES (published articles), ALL_COMMENTS, ALL_LIKES, JOB_APPLICATIONS, JOB_POSTINGS (jobs they posted), SAVED_JOBS, JOB_SEEKER_PREFERENCES.",
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
    "linkedin_get_section",
    {
      title: "Get one LinkedIn section",
      description:
        "Get raw data for a single LinkedIn section by exact name. Use when you need one specific section or the raw API response. Section names are case-sensitive.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        domain: z
          .enum(SNAPSHOT_DOMAINS)
          .describe(
            "Section name (case-sensitive). Résumé: PROFILE, PROFILE_SUMMARY, POSITIONS, EDUCATION, SKILLS, CERTIFICATIONS, PROJECTS, ORGANIZATIONS, LANGUAGES, HONORS, COURSES, PUBLICATIONS, PATENTS, VOLUNTEERING_EXPERIENCES, RECOMMENDATIONS. Activity: CONNECTIONS, MEMBER_SHARE_INFO, ARTICLES, ALL_COMMENTS, ALL_LIKES, JOB_APPLICATIONS, JOB_POSTINGS, SAVED_JOBS, JOB_SEEKER_PREFERENCES.",
          ),
        maxPages: maxPagesSchema,
      }),
      outputSchema: snapshotDomainOutputSchema,
    },
    async ({ domain, maxPages }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const result = await client.getSnapshotDomain({ accessToken, apiVersion, domain, maxPages });
        return makeSuccessResult(`Fetched ${result.snapshotData.length} item(s) from ${domain}.`, {
          apiVersion,
          ...result,
        });
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_get_recent_changes",
    {
      title: "Get recent LinkedIn changes",
      description:
        "Get the user's LinkedIn data changes from the past 28 days (profile edits, new connections, etc.). Poll incrementally by passing the previous response's nextStartTime. If empty, run linkedin_check_access to verify consent.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({
        startTime: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Only return changes at or after this Unix timestamp in milliseconds. Omit for the most recent changes. For polling, pass the previous response's nextStartTime.",
          ),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Events per page (1–50)."),
        maxPages: maxPagesSchema,
      }),
      outputSchema: changelogOutputSchema,
    },
    async ({ startTime, count, maxPages }) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const changelog = await client.getChangelog({ accessToken, apiVersion, startTime, count, maxPages });
        return makeSuccessResult(`Fetched ${changelog.events.length} change event(s).`, changelog);
      } catch (error) {
        return makeErrorResult(error);
      }
    },
  );

  server.registerTool(
    "linkedin_check_access",
    {
      title: "Check LinkedIn access",
      description:
        "Check whether the user has granted LinkedIn data access to this app. Use to diagnose missing data or 403 errors before retrying other tools.",
      annotations: readOnlyLinkedInAnnotations,
      inputSchema: z.object({}),
    },
    async (_args) => {
      try {
        const { accessToken, apiVersion } = resolveLinkedInAuth(config);
        const authorizationStatus = await client.getAuthorizationStatus({ accessToken, apiVersion });
        return makeSuccessResult("Fetched LinkedIn access status.", authorizationStatus);
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
  return `Fetched LinkedIn data (${summary}).`;
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