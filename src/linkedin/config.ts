import { DEFAULT_LINKEDIN_API_VERSION } from "./types.js";

export const LINKEDIN_AUTHORIZATION_ENV = "LINKEDIN_AUTHORIZATION";
export const LINKEDIN_API_VERSION_ENV = "LINKEDIN_API_VERSION";

export type LinkedInRuntimeConfig = {
  accessToken?: string;
  apiVersion: string;
};

export function readLinkedInRuntimeConfig(env: NodeJS.ProcessEnv = process.env): LinkedInRuntimeConfig {
  return {
    accessToken: readAccessToken(env),
    apiVersion: readNonEmptyEnv(env, LINKEDIN_API_VERSION_ENV) ?? DEFAULT_LINKEDIN_API_VERSION,
  };
}

function readAccessToken(env: NodeJS.ProcessEnv): string | undefined {
  const value = readNonEmptyEnv(env, LINKEDIN_AUTHORIZATION_ENV);
  if (!value) {
    return undefined;
  }

  const bearerPrefix = "Bearer ";
  if (value.toLowerCase().startsWith(bearerPrefix.toLowerCase())) {
    return value.slice(bearerPrefix.length).trim() || undefined;
  }

  return value;
}

function readNonEmptyEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}