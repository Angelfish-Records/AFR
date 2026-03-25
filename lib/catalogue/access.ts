import type { GetServerSidePropsContext } from "next";

function getAccessTokenFromRequest(context: GetServerSidePropsContext): string | null {
  const queryToken = context.query.t;
  if (typeof queryToken === "string" && queryToken.trim().length > 0) {
    return queryToken.trim();
  }

  const headerValue = context.req.headers["x-catalogue-token"];
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  return null;
}

export function isCatalogueAccessEnabled(): boolean {
  const token = process.env.CATALOGUE_ACCESS_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}

export function hasCatalogueAccess(context: GetServerSidePropsContext): boolean {
  if (!isCatalogueAccessEnabled()) {
    return true;
  }

  const configuredToken = process.env.CATALOGUE_ACCESS_TOKEN;
  const providedToken = getAccessTokenFromRequest(context);

  return Boolean(
    configuredToken &&
      providedToken &&
      configuredToken.trim().length > 0 &&
      configuredToken === providedToken
  );
}