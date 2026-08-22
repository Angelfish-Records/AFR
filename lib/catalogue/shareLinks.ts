import crypto from "crypto";
import { sql } from "@vercel/postgres";
import type {
  CatalogueShareLinkCreateInput,
  CatalogueShareLinkSummary,
} from "@/lib/catalogue/shareLinkTypes";

type DbShareLinkRow = {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  label: string | null;
  welcome_message: string | null;
  curated_recording_ids: string[] | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  created_by: string | null;
  last_accessed_at: Date | string | null;
};

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRecordingIds(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const recordingId = value.trim();

    if (!recordingId || seen.has(recordingId)) {
      continue;
    }

    seen.add(recordingId);
    normalized.push(recordingId);
  }

  if (normalized.length > 50) {
    throw new Error(
      "A curated share link may contain at most 50 recordings",
    );
  }

  return normalized;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapRow(row: DbShareLinkRow): CatalogueShareLinkSummary {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    label: row.label,
    welcomeMessage: row.welcome_message,
    curatedRecordingIds: row.curated_recording_ids ?? [],
    expiresAt: toIsoString(row.expires_at),
    revokedAt: toIsoString(row.revoked_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    createdBy: row.created_by,
    lastAccessedAt: toIsoString(row.last_accessed_at),
  };
}

export function hashCatalogueShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRawCatalogueShareToken(): string {
  const random = crypto.randomBytes(24).toString("hex");
  return `cat_${random}`;
}

export async function listCatalogueShareLinks(
  limit = 50
): Promise<CatalogueShareLinkSummary[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  const result = await sql<DbShareLinkRow>`
    select
      id,
      recipient_name,
      recipient_email,
      label,
      welcome_message,
      curated_recording_ids,
      expires_at,
      revoked_at,
      created_at,
      created_by,
      last_accessed_at
    from catalogue_share_links
    order by created_at desc
    limit ${safeLimit}
  `;

  return result.rows.map(mapRow);
}

export async function createCatalogueShareLink(
  input: CatalogueShareLinkCreateInput
): Promise<{
  link: CatalogueShareLinkSummary;
  rawToken: string;
}> {
  const id = crypto.randomUUID();
  const rawToken = createRawCatalogueShareToken();
  const tokenHash = hashCatalogueShareToken(rawToken);

  const recipientName = normalizeNullableString(input.recipientName);
  const recipientEmail = normalizeNullableString(input.recipientEmail);
  const label = normalizeNullableString(input.label);
  const welcomeMessage = normalizeNullableString(input.welcomeMessage);

  if (welcomeMessage !== null && welcomeMessage.length > 600) {
    throw new Error("Catalogue welcome message is too long");
  }

  const curatedRecordingIds = normalizeRecordingIds(
    input.curatedRecordingIds,
  );
  const curatedRecordingIdsJson = JSON.stringify(curatedRecordingIds);
  const createdBy = normalizeNullableString(input.createdBy);
  const expiresAt = normalizeNullableString(input.expiresAt);

  const insertResult = await sql<DbShareLinkRow>`
    insert into catalogue_share_links (
      id,
      token_hash,
      recipient_name,
      recipient_email,
      label,
      welcome_message,
      curated_recording_ids,
      expires_at,
      created_by
    )
    values (
      ${id},
      ${tokenHash},
      ${recipientName},
      ${recipientEmail},
      ${label},
      ${welcomeMessage},
      array(
        select jsonb_array_elements_text(
          ${curatedRecordingIdsJson}::jsonb
        )
      ),
      ${expiresAt ? new Date(expiresAt).toISOString() : null},
      ${createdBy}
    )
    returning
      id,
      recipient_name,
      recipient_email,
      label,
      welcome_message,
      curated_recording_ids,
      expires_at,
      revoked_at,
      created_at,
      created_by,
      last_accessed_at
  `;

  const row = insertResult.rows[0];
  if (!row) {
    throw new Error("Failed to create share link");
  }

  return {
    link: mapRow(row),
    rawToken,
  };
}

export async function revokeCatalogueShareLink(id: string): Promise<boolean> {
  const safeId = normalizeNullableString(id);
  if (!safeId) {
    return false;
  }

  const result = await sql`
    update catalogue_share_links
    set revoked_at = now()
    where id = ${safeId}
      and revoked_at is null
  `;

  return (result.rowCount ?? 0) > 0;
}

export async function resolveCatalogueShareToken(
  rawToken: string,
  options?: { touch?: boolean },
): Promise<CatalogueShareLinkSummary | null> {
  const token = normalizeNullableString(rawToken);
  if (!token) {
    return null;
  }

  const tokenHash = hashCatalogueShareToken(token);

  const result = await sql<DbShareLinkRow>`
    select
      id,
      recipient_name,
      recipient_email,
      label,
      welcome_message,
      curated_recording_ids,
      expires_at,
      revoked_at,
      created_at,
      created_by,
      last_accessed_at
    from catalogue_share_links
    where token_hash = ${tokenHash}
    limit 1
  `;

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const revokedAt = toIsoString(row.revoked_at);
  if (revokedAt) {
    return null;
  }

  const expiresAt = toIsoString(row.expires_at);
  if (expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);

    if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
      return null;
    }
  }

  if (options?.touch) {
    await sql`
      update catalogue_share_links
      set last_accessed_at = now()
      where id = ${row.id}
    `;
  }

  return mapRow(row);
}

export async function validateCatalogueShareToken(
  rawToken: string,
  options?: { touch?: boolean },
): Promise<boolean> {
  const link = await resolveCatalogueShareToken(rawToken, options);
  return link !== null;
}
