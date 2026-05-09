export const LINKEDIN_API_BASE_URL = "https://api.linkedin.com";
export const DEFAULT_LINKEDIN_API_VERSION = "202312";

export const DEFAULT_PROFILE_DOMAINS = [
  "PROFILE",
  "POSITIONS",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "PROJECTS",
] as const;

// Personal professional identity — generally small, bio/career focused.
export const PROFILE_DOMAINS = [
  "PROFILE",
  "PROFILE_SUMMARY",
  "POSITIONS",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "PROJECTS",
  "ORGANIZATIONS",
  "LANGUAGES",
  "HONORS",
  "COURSES",
  "PUBLICATIONS",
  "PATENTS",
  "VOLUNTEERING_EXPERIENCES",
  "RECOMMENDATIONS",
] as const;

// Social activity and job-related — can be large.
export const ACTIVITY_DOMAINS = [
  "CONNECTIONS",
  "MEMBER_SHARE_INFO",
  "ARTICLES",
  "ALL_COMMENTS",
  "ALL_LIKES",
  "JOB_APPLICATIONS",
  "JOB_POSTINGS",
  "SAVED_JOBS",
  "JOB_SEEKER_PREFERENCES",
] as const;

export const SNAPSHOT_DOMAINS = [...PROFILE_DOMAINS, ...ACTIVITY_DOMAINS] as const;

export type JsonObject = Record<string, unknown>;
export type SnapshotDomain = (typeof SNAPSHOT_DOMAINS)[number];

export type LinkedInAuth = {
  accessToken: string;
  apiVersion: string;
};

export type SnapshotDomainResult = {
  domain: SnapshotDomain;
  snapshotData: unknown[];
  rawElements: unknown[];
  pageCount: number;
  truncated: boolean;
};

export type ProfileSnapshotResult = {
  apiVersion: string;
  domains: Partial<Record<SnapshotDomain, unknown[]>>;
  metadata: Array<{
    domain: SnapshotDomain;
    itemCount: number;
    pageCount: number;
    truncated: boolean;
  }>;
};

export type ChangelogResult = {
  apiVersion: string;
  events: unknown[];
  nextStartTime?: number;
  pageCount: number;
  truncated: boolean;
};

export type AuthorizationStatusResult = JsonObject & {
  apiVersion: string;
};