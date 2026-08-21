import type { GetServerSidePropsContext, NextApiRequest } from "next";
import {
  resolveCatalogueShareToken,
  validateCatalogueShareToken,
} from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

export type CatalogueAccessState = "granted" | "missing" | "invalid";

export type CatalogueApiAccessContext =
  | {
      granted: true;
      shareLink: CatalogueShareLinkSummary | null;
    }
  | {
      granted: false;
      shareLink: null;
    };

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

export async function getCatalogueApiAccessContext(
  req: NextApiRequest,
): Promise<CatalogueApiAccessContext> {
  const shareToken = getApiRequestShareToken(req);

  if (shareToken) {
    const shareLink = await resolveCatalogueShareToken(shareToken, {
      touch: true,
    });

    if (shareLink) {
      return {
        granted: true,
        shareLink,
      };
    }

    const configuredFallbackToken = getConfiguredFallbackToken();

    if (configuredFallbackToken && shareToken === configuredFallbackToken) {
      return {
        granted: true,
        shareLink: null,
      };
    }
  }

  return {
    granted: false,
    shareLink: null,
  };
}

export async function hasCatalogueApiAccess(
  req: NextApiRequest,
): Promise<boolean> {
  const context = await getCatalogueApiAccessContext(req);
  return context.granted;
}
