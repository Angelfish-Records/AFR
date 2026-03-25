import type { GetServerSidePropsContext, NextApiRequest } from "next";

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getQueryTokenFromUnknown(input: unknown): string | null {
  if (typeof input === "string") {
    return normalizeToken(input);
  }

  if (Array.isArray(input)) {
    return normalizeToken(input[0]);
  }

  return null;
}

function getHeaderTokenFromUnknown(input: string | string[] | undefined): string | null {
  if (typeof input === "string") {
    return normalizeToken(input);
  }

  if (Array.isArray(input)) {
    return normalizeToken(input[0]);
  }

  return null;
}

function getConfiguredToken(): string | null {
  return normalizeToken(process.env.CATALOGUE_ACCESS_TOKEN);
}

function getAccessTokenFromPageRequest(
  context: GetServerSidePropsContext
): string | null {
  const queryToken = getQueryTokenFromUnknown(context.query.t);
  if (queryToken) {
    return queryToken;
  }

  return getHeaderTokenFromUnknown(context.req.headers["x-catalogue-token"]);
}

function getAccessTokenFromApiRequest(req: NextApiRequest): string | null {
  const queryToken = getQueryTokenFromUnknown(req.query.t);
  if (queryToken) {
    return queryToken;
  }

  return getHeaderTokenFromUnknown(req.headers["x-catalogue-token"]);
}

export function isCatalogueAccessEnabled(): boolean {
  return Boolean(getConfiguredToken());
}

export function hasCatalogueAccess(context: GetServerSidePropsContext): boolean {
  const configuredToken = getConfiguredToken();

  if (!configuredToken) {
    return true;
  }

  const providedToken = getAccessTokenFromPageRequest(context);
  return providedToken === configuredToken;
}

export function hasCatalogueApiAccess(req: NextApiRequest): boolean {
  const configuredToken = getConfiguredToken();

  if (!configuredToken) {
    return true;
  }

  const providedToken = getAccessTokenFromApiRequest(req);
  return providedToken === configuredToken;
}