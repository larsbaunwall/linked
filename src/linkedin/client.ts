import {
  LINKEDIN_API_BASE_URL,
  type AuthorizationStatusResult,
  type ChangelogResult,
  type JsonObject,
  type LinkedInAuth,
  type ProfileSnapshotResult,
  type SnapshotDomain,
  type SnapshotDomainResult,
} from "./types.js";

export type LinkedInClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  requestTimeoutMs?: number;
  /** Max retry attempts for transient failures (429 / 5xx / network errors). Defaults to 3. */
  maxRetries?: number;
};

type PagedLinkedInResult = {
  elements: unknown[];
  pageCount: number;
  truncated: boolean;
};

type LinkedInSnapshotElement = {
  snapshotDomain?: string;
  snapshotData?: unknown[];
  [key: string]: unknown;
};

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serviceErrorCode?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;

export class LinkedInClient {
  readonly #baseUrl: string;
  readonly #allowedHost: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;
  readonly #maxRetries: number;

  constructor({
    baseUrl = LINKEDIN_API_BASE_URL,
    fetchImpl = fetch,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
  }: LinkedInClientOptions = {}) {
    this.#baseUrl = baseUrl;
    this.#allowedHost = new URL(baseUrl).host;
    this.#fetch = fetchImpl;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#maxRetries = maxRetries;
  }

  async getProfile({
    accessToken,
    apiVersion,
    domains,
    maxPagesPerDomain,
  }: LinkedInAuth & {
    domains: readonly SnapshotDomain[];
    maxPagesPerDomain: number;
  }): Promise<ProfileSnapshotResult> {
    const uniqueDomains = [...new Set(domains)];
    const domainResults = await Promise.all(
      uniqueDomains.map((domain) =>
        this.getSnapshotDomain({ accessToken, apiVersion, domain, maxPages: maxPagesPerDomain }),
      ),
    );
    const domainsByName: Partial<Record<SnapshotDomain, unknown[]>> = {};
    for (const result of domainResults) {
      domainsByName[result.domain] = result.snapshotData;
    }

    return {
      apiVersion,
      domains: domainsByName,
      metadata: domainResults.map(({ domain, pageCount, truncated, snapshotData }) => ({
        domain,
        itemCount: snapshotData.length,
        pageCount,
        truncated,
      })),
    };
  }

  async getSnapshotDomain({
    accessToken,
    apiVersion,
    domain,
    maxPages,
  }: LinkedInAuth & { domain: SnapshotDomain; maxPages: number }): Promise<SnapshotDomainResult> {
    let result: PagedLinkedInResult;
    try {
      result = await this.getPaged(
        this.buildUrl("/rest/memberSnapshotData", { q: "criteria", domain }),
        accessToken,
        apiVersion,
        maxPages,
      );
    } catch (error) {
      if (error instanceof LinkedInApiError && error.status === 404) {
        return { domain, snapshotData: [], rawElements: [], pageCount: 0, truncated: false };
      }
      throw error;
    }

    const snapshotData = result.elements.flatMap((element) => {
      const snapshotElement = asJsonObject(element) as LinkedInSnapshotElement;
      return Array.isArray(snapshotElement.snapshotData) ? snapshotElement.snapshotData : [];
    });

    return {
      domain,
      snapshotData,
      rawElements: result.elements,
      pageCount: result.pageCount,
      truncated: result.truncated,
    };
  }

  async getChangelog({
    accessToken,
    apiVersion,
    startTime,
    count,
    maxPages,
  }: LinkedInAuth & { startTime?: number; count: number; maxPages: number }): Promise<ChangelogResult> {
    const result = await this.getPaged(
      this.buildUrl("/rest/memberChangeLogs", { q: "memberAndApplication", startTime, count }),
      accessToken,
      apiVersion,
      maxPages,
    );
    const processedAtValues = result.elements
      .map((element) => asJsonObject(element).processedAt)
      .filter((processedAt): processedAt is number => typeof processedAt === "number");
    const nextStartTime = processedAtValues.length > 0 ? Math.max(...processedAtValues) : startTime;

    return {
      apiVersion,
      events: result.elements,
      ...(nextStartTime === undefined ? {} : { nextStartTime }),
      pageCount: result.pageCount,
      truncated: result.truncated,
    };
  }

  async getAuthorizationStatus({ accessToken, apiVersion }: LinkedInAuth): Promise<AuthorizationStatusResult> {
    const responseJson = await this.getJson(
      this.buildUrl("/rest/memberAuthorizations", { q: "memberAndApplication" }),
      accessToken,
      apiVersion,
    );

    return {
      apiVersion,
      ...responseJson,
    };
  }

  private buildUrl(pathname: string, query: Record<string, string | number | undefined> = {}): URL {
    const url = new URL(pathname, this.#baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async getPaged(url: URL, accessToken: string, apiVersion: string, maxPages: number): Promise<PagedLinkedInResult> {
    const elements: unknown[] = [];
    let currentUrl: URL | undefined = url;
    let pageCount = 0;

    while (currentUrl && pageCount < maxPages) {
      const responseJson = await this.getJson(currentUrl, accessToken, apiVersion);
      elements.push(...asElements(responseJson));
      pageCount += 1;
      currentUrl = getNextPageUrl(responseJson, this.#baseUrl, this.#allowedHost);
    }

    return {
      elements,
      pageCount,
      truncated: Boolean(currentUrl),
    };
  }

  private async getJson(url: URL, accessToken: string, apiVersion: string): Promise<JsonObject> {
    // Defense in depth: never send the bearer token to a host other than the configured LinkedIn API.
    if (url.protocol !== "https:" || url.host !== this.#allowedHost) {
      throw new LinkedInApiError(
        `Refusing to send request to unexpected host "${url.host}". Expected "${this.#allowedHost}".`,
        0,
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        const response = await this.#fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Linkedin-Version": apiVersion,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(this.#requestTimeoutMs),
        });
        const responseJson = await parseLinkedInResponse(response);

        if (response.ok) {
          return responseJson;
        }

        const message = typeof responseJson.message === "string" ? responseJson.message : response.statusText;
        const serviceErrorCode =
          typeof responseJson.serviceErrorCode === "number" ? responseJson.serviceErrorCode : undefined;
        const apiError = new LinkedInApiError(
          getLinkedInFailureMessage(response.status, message),
          response.status,
          serviceErrorCode,
          getRequestId(response.headers),
        );

        if (!isRetryableStatus(response.status) || attempt === this.#maxRetries) {
          throw apiError;
        }
        lastError = apiError;
        await sleep(getRetryDelayMs(attempt, response.headers.get("retry-after")));
        continue;
      } catch (error) {
        if (error instanceof LinkedInApiError) {
          throw error;
        }
        // Network error / timeout — retry if attempts remain.
        lastError = error;
        if (attempt === this.#maxRetries) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new LinkedInApiError(`LinkedIn request failed: ${reason}`, 0);
        }
        await sleep(getRetryDelayMs(attempt, null));
      }
    }
    // Unreachable, but keeps the type-checker happy.
    throw lastError instanceof Error ? lastError : new Error("LinkedIn request failed");
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

function getRetryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);
    }
  }
  const exponential = RETRY_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * RETRY_BASE_DELAY_MS;
  return Math.min(exponential + jitter, RETRY_MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asJsonObject(value: unknown): JsonObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function asElements(responseJson: JsonObject): unknown[] {
  const elements = responseJson.elements;
  return Array.isArray(elements) ? elements : [];
}

function getNextPageUrl(responseJson: JsonObject, baseUrl: string, allowedHost: string): URL | undefined {
  const paging = asJsonObject(responseJson.paging);
  const links = paging.links;
  if (!Array.isArray(links)) {
    return undefined;
  }

  const nextLink = links.find((link) => asJsonObject(link).rel === "next");
  const href = asJsonObject(nextLink).href;
  if (typeof href !== "string") {
    return undefined;
  }

  // Defense in depth: ignore any "next" link that points off the LinkedIn API host so we never
  // send the bearer token to an attacker-controlled URL if a response is tampered with.
  let nextUrl: URL;
  try {
    nextUrl = new URL(href, baseUrl);
  } catch {
    return undefined;
  }
  if (nextUrl.protocol !== "https:" || nextUrl.host !== allowedHost) {
    return undefined;
  }
  return nextUrl;
}

function getRequestId(headers: Headers): string | undefined {
  return headers.get("x-li-uuid") ?? headers.get("x-restli-id") ?? headers.get("x-li-fabric") ?? undefined;
}

function getLinkedInFailureMessage(status: number, message: string): string {
  const suffix = "Member Data Portability is currently available only to LinkedIn members in the EEA and Switzerland.";

  switch (status) {
    case 400:
      return `LinkedIn rejected the request as invalid. Check the domain, timestamp, count, or query parameters. ${message}`;
    case 401:
      return `LinkedIn rejected the access token. It may be missing, expired, revoked, invalid, or malformed. ${message}`;
    case 403:
      return `LinkedIn denied access. Confirm the developer app has the Member Data Portability API (Member) product, the token has a DMA portability scope such as r_dma_portability_self_serve, and member consent is active. ${suffix} ${message}`;
    case 404:
      return `LinkedIn could not find this API endpoint or the API is restricted for this application. ${message}`;
    case 426:
      return `LinkedIn rejected the configured API version. Try a supported LINKEDIN_API_VERSION value. ${message}`;
    case 429:
      return `LinkedIn rate-limited the request. Retry later and reduce duplicate calls. ${message}`;
    default:
      if (status >= 500) {
        return `LinkedIn returned a server-side failure or timeout. Retry later. ${message}`;
      }
      return `LinkedIn returned HTTP ${status}. ${message}`;
  }
}

async function parseLinkedInResponse(response: Response): Promise<JsonObject> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return asJsonObject(JSON.parse(text));
  } catch {
    return { message: text };
  }
}