import crypto from "crypto";
import { sql } from "@vercel/postgres";
import type { NextApiRequest } from "next";

const MAX_BODY_BYTES = 16 * 1024;
const NETWORK_REQUESTS_PER_HOUR = 10;

type RateLimitRow = {
  request_count: number;
  retry_after_seconds: number;
};

export type CatalogueLicensingRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function firstHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first || null;
  }

  return null;
}

function firstListItem(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim();

  return first || null;
}

function hostnameFromHostHeader(
  value: string,
): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(
      `http://${trimmed}`,
    ).hostname.toLowerCase();
  } catch {
    return (
      trimmed
        .toLowerCase()
        .replace(/:\d+$/, "") || null
    );
  }
}

function getRequestHostname(
  req: NextApiRequest,
): string | null {
  const forwardedHost = firstListItem(
    firstHeaderValue(
      req.headers["x-forwarded-host"],
    ),
  );

  if (forwardedHost) {
    return hostnameFromHostHeader(
      forwardedHost,
    );
  }

  const host = firstListItem(
    firstHeaderValue(
      req.headers.host,
    ),
  );

  return host
    ? hostnameFromHostHeader(host)
    : null;
}

function getNetworkAddress(
  req: NextApiRequest,
): string | null {
  const realIp = firstListItem(
    firstHeaderValue(
      req.headers["x-real-ip"],
    ),
  );

  const forwardedFor = firstListItem(
    firstHeaderValue(
      req.headers["x-forwarded-for"],
    ),
  );

  const candidate =
    realIp ?? forwardedFor;

  if (!candidate) {
    return null;
  }

  const normalized =
    candidate
      .trim()
      .toLowerCase()
      .slice(0, 120);

  return normalized || null;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isCatalogueLicensingJsonRequest(
  req: NextApiRequest,
): boolean {
  const contentType =
    firstHeaderValue(
      req.headers["content-type"],
    );

  if (!contentType) {
    return false;
  }

  return (
    contentType
      .split(";")[0]
      ?.trim()
      .toLowerCase() ===
    "application/json"
  );
}

export function isCatalogueLicensingPayloadTooLarge(
  req: NextApiRequest,
): boolean {
  const contentLength =
    firstHeaderValue(
      req.headers["content-length"],
    );

  if (!contentLength) {
    return false;
  }

  const bytes = Number(
    contentLength,
  );

  return (
    Number.isFinite(bytes) &&
    bytes > MAX_BODY_BYTES
  );
}

export function isCatalogueLicensingSameOriginRequest(
  req: NextApiRequest,
): boolean {
  const fetchSite =
    firstHeaderValue(
      req.headers["sec-fetch-site"],
    );

  if (
    fetchSite?.toLowerCase() ===
    "cross-site"
  ) {
    return false;
  }

  const origin =
    firstHeaderValue(
      req.headers.origin,
    );

  if (!origin) {
    return true;
  }

  const requestHostname =
    getRequestHostname(req);

  if (!requestHostname) {
    return false;
  }

  try {
    const originUrl =
      new URL(origin);

    if (
      originUrl.protocol !== "https:" &&
      originUrl.protocol !== "http:"
    ) {
      return false;
    }

    return (
      originUrl.hostname.toLowerCase() ===
      requestHostname
    );
  } catch {
    return false;
  }
}

export function isCatalogueLicensingHoneypotTriggered(
  bodyUnknown: unknown,
): boolean {
  if (
    !isObject(bodyUnknown) ||
    !("companyWebsite" in bodyUnknown)
  ) {
    return false;
  }

  const value =
    bodyUnknown.companyWebsite;

  return (
    typeof value !== "string" ||
    value.trim().length > 0
  );
}

function requiredRateLimitSecret(): string {
  const value =
    process.env
      .CATALOGUE_ABUSE_RATE_LIMIT_SECRET
      ?.trim();

  if (!value) {
    throw new Error(
      "Missing required environment variable: CATALOGUE_ABUSE_RATE_LIMIT_SECRET",
    );
  }

  return value;
}

function rotatingNetworkKey(
  networkAddress: string,
  secret: string,
): string {
  const utcDay =
    new Date()
      .toISOString()
      .slice(0, 10);

  return crypto
    .createHmac(
      "sha256",
      secret,
    )
    .update(
      `catalogue-licensing:v1:${utcDay}:${networkAddress}`,
    )
    .digest("hex");
}

export async function consumeCatalogueLicensingRateLimit(
  req: NextApiRequest,
): Promise<CatalogueLicensingRateLimitResult> {
  const networkAddress =
    getNetworkAddress(req);

  if (!networkAddress) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  const keyHash =
    rotatingNetworkKey(
      networkAddress,
      requiredRateLimitSecret(),
    );

  const result = await sql<RateLimitRow>`
    insert into catalogue_licensing_rate_limits (
      key_hash,
      window_started_at,
      request_count,
      updated_at
    )
    values (
      ${keyHash},
      now(),
      1,
      now()
    )
    on conflict (key_hash) do update set
      window_started_at = case
        when catalogue_licensing_rate_limits.window_started_at
          <= now() - interval '1 hour'
          then now()
        else catalogue_licensing_rate_limits.window_started_at
      end,
      request_count = case
        when catalogue_licensing_rate_limits.window_started_at
          <= now() - interval '1 hour'
          then 1
        else catalogue_licensing_rate_limits.request_count + 1
      end,
      updated_at = now()
    returning
      request_count,
      greatest(
        1,
        ceil(
          extract(
            epoch from (
              window_started_at
              + interval '1 hour'
              - now()
            )
          )
        )::int
      ) as retry_after_seconds
  `;

  const row =
    result.rows[0];

  if (!row) {
    throw new Error(
      "Failed to update catalogue licensing rate limit",
    );
  }

  try {
    await sql`
      delete from catalogue_licensing_rate_limits
      where updated_at
        < now() - interval '2 days'
    `;
  } catch (error) {
    console.error(
      "[catalogue licensing] rate-limit cleanup failed",
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown rate-limit cleanup error",
      },
    );
  }

  return {
    allowed:
      row.request_count <=
      NETWORK_REQUESTS_PER_HOUR,
    retryAfterSeconds:
      row.request_count <=
      NETWORK_REQUESTS_PER_HOUR
        ? 0
        : row.retry_after_seconds,
  };
}
