import type { GetServerSidePropsContext, NextApiRequest } from "next";
import { validateCatalogueShareToken } from "@/lib/catalogue/shareLinks";

export type CatalogueAccessState = "granted" | "missing" | "invalid";

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

function getConfiguredFallbackToken(): string | null {
  return normalizeToken(process.env.CATALOGUE_ACCESS_TOKEN);
}

function getPageRequestShareToken(context: GetServerSidePropsContext): string | null {
  const shareToken =
    getQueryTokenFromUnknown(context.query.st) ??
    getQueryTokenFromUnknown(context.query.t);

  if (shareToken) {
    return shareToken;
  }

  return (
    getHeaderTokenFromUnknown(context.req.headers["x-catalogue-share-token"]) ??
    getHeaderTokenFromUnknown(context.req.headers["x-catalogue-token"])
  );
}

function getApiRequestShareToken(req: NextApiRequest): string | null {
  const shareToken =
    getQueryTokenFromUnknown(req.query.st) ??
    getQueryTokenFromUnknown(req.query.t);

  if (shareToken) {
    return shareToken;
  }

  return (
    getHeaderTokenFromUnknown(req.headers["x-catalogue-share-token"]) ??
    getHeaderTokenFromUnknown(req.headers["x-catalogue-token"])
  );
}

export async function getCataloguePageAccessState(
  context: GetServerSidePropsContext
): Promise<CatalogueAccessState> {
  const shareToken = getPageRequestShareToken(context);

  if (shareToken) {
    const valid = await validateCatalogueShareToken(shareToken, { touch: true });
    if (valid) {
      return "granted";
    }

    const configuredFallbackToken = getConfiguredFallbackToken();
    if (configuredFallbackToken && shareToken === configuredFallbackToken) {
      return "granted";
    }

    return "invalid";
  }

  return "missing";
}

export async function hasCatalogueAccess(
  context: GetServerSidePropsContext
): Promise<boolean> {
  return (await getCataloguePageAccessState(context)) === "granted";
}

export async function hasCatalogueApiAccess(req: NextApiRequest): Promise<boolean> {
  const shareToken = getApiRequestShareToken(req);

  if (shareToken) {
    const valid = await validateCatalogueShareToken(shareToken, { touch: true });
    if (valid) {
      return true;
    }

    const configuredFallbackToken = getConfiguredFallbackToken();
    if (configuredFallbackToken && shareToken === configuredFallbackToken) {
      return true;
    }
  }

  return false;
}