import type { GetServerSidePropsContext, NextApiRequest } from "next";
import { resolveCatalogueShareToken } from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

export type CatalogueAttributionContext = {
  shareLink: CatalogueShareLinkSummary | null;
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

function getHeaderTokenFromUnknown(
  input: string | string[] | undefined,
): string | null {
  if (typeof input === "string") {
    return normalizeToken(input);
  }

  if (Array.isArray(input)) {
    return normalizeToken(input[0]);
  }

  return null;
}

function getPageRequestShareToken(
  context: GetServerSidePropsContext,
): string | null {
  const shareToken =
    getQueryTokenFromUnknown(context.query.st) ??
    getQueryTokenFromUnknown(context.query.t);

  if (shareToken) {
    return shareToken;
  }

  return (
    getHeaderTokenFromUnknown(
      context.req.headers["x-catalogue-share-token"],
    ) ??
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

async function resolveOptionalCatalogueAttribution(
  rawToken: string | null,
): Promise<CatalogueShareLinkSummary | null> {
  if (!rawToken) {
    return null;
  }

  try {
    return await resolveCatalogueShareToken(rawToken, {
      touch: true,
    });
  } catch (error) {
    console.error("[catalogue attribution] resolution failed", {
      error:
        error instanceof Error
          ? error.message
          : "Unknown catalogue attribution error",
    });

    return null;
  }
}

export async function resolveCataloguePageAttribution(
  context: GetServerSidePropsContext,
): Promise<CatalogueShareLinkSummary | null> {
  return resolveOptionalCatalogueAttribution(
    getPageRequestShareToken(context),
  );
}

export async function touchCatalogueApiAttribution(
  req: NextApiRequest,
): Promise<void> {
  await resolveOptionalCatalogueAttribution(
    getApiRequestShareToken(req),
  );
}

export async function getCatalogueApiAttributionContext(
  req: NextApiRequest,
): Promise<CatalogueAttributionContext> {
  return {
    shareLink: await resolveOptionalCatalogueAttribution(
      getApiRequestShareToken(req),
    ),
  };
}
