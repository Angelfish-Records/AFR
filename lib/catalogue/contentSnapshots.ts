import crypto from "crypto";
import { sql } from "@vercel/postgres";

export type AirtableContentSnapshotKey =
  | "sync_catalogue"
  | "website_catalogue";

export type AirtableContentSnapshotMetadata = {
  key: AirtableContentSnapshotKey;
  itemCount: number;
  sourceHash: string;
  refreshedAt: string;
};

export type AirtableContentSnapshot =
  AirtableContentSnapshotMetadata & {
    payload: unknown;
  };

type SnapshotRow = {
  snapshot_key: string;
  payload: unknown;
  item_count: number;
  source_hash: string;
  refreshed_at: Date | string;
};

type RefreshLockRow = {
  lock_key: string;
};

type SnapshotWriteInput = {
  syncCatalogue: {
    payload: unknown;
    itemCount: number;
  };
  websiteCatalogue: {
    payload: unknown;
    itemCount: number;
  };
};

function isSnapshotKey(
  value: string,
): value is AirtableContentSnapshotKey {
  return (
    value === "sync_catalogue" ||
    value === "website_catalogue"
  );
}

function serializePayload(
  payload: unknown,
  label: string,
): string {
  const serialized = JSON.stringify(payload);

  if (typeof serialized !== "string") {
    throw new Error(
      `Unable to serialize ${label} snapshot payload`,
    );
  }

  return serialized;
}

function hashPayload(serialized: string): string {
  return crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");
}

function parseRefreshedAt(
  value: Date | string,
): string {
  const parsed =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      "Airtable content snapshot has an invalid refreshed_at value",
    );
  }

  return parsed.toISOString();
}

function mapSnapshotRow(
  row: SnapshotRow,
): AirtableContentSnapshot {
  if (!isSnapshotKey(row.snapshot_key)) {
    throw new Error(
      `Unknown Airtable content snapshot key "${row.snapshot_key}"`,
    );
  }

  if (
    !Number.isInteger(row.item_count) ||
    row.item_count < 0
  ) {
    throw new Error(
      `Invalid item count for snapshot "${row.snapshot_key}"`,
    );
  }

  if (!/^[0-9a-f]{64}$/.test(row.source_hash)) {
    throw new Error(
      `Invalid source hash for snapshot "${row.snapshot_key}"`,
    );
  }

  return {
    key: row.snapshot_key,
    payload: row.payload,
    itemCount: row.item_count,
    sourceHash: row.source_hash,
    refreshedAt: parseRefreshedAt(row.refreshed_at),
  };
}

export async function readAirtableContentSnapshot(
  key: AirtableContentSnapshotKey,
): Promise<AirtableContentSnapshot | null> {
  const result = await sql<SnapshotRow>`
    select
      snapshot_key,
      payload,
      item_count,
      source_hash,
      refreshed_at
    from airtable_content_snapshots
    where snapshot_key = ${key}
    limit 1
  `;

  const row = result.rows[0];

  return row ? mapSnapshotRow(row) : null;
}

export async function requireAirtableContentSnapshot(
  key: AirtableContentSnapshotKey,
): Promise<AirtableContentSnapshot> {
  const snapshot =
    await readAirtableContentSnapshot(key);

  if (!snapshot) {
    throw new Error(
      `Missing Airtable content snapshot "${key}". ` +
        "Refresh the catalogue snapshot before serving this runtime.",
    );
  }

  return snapshot;
}

export async function tryAcquireCatalogueSnapshotRefreshLock(): Promise<boolean> {
  const result = await sql<RefreshLockRow>`
    insert into airtable_content_refresh_locks (
      lock_key,
      locked_until,
      updated_at
    )
    values (
      'catalogue',
      now() + interval '5 minutes',
      now()
    )
    on conflict (lock_key) do update set
      locked_until = excluded.locked_until,
      updated_at = now()
    where
      airtable_content_refresh_locks.locked_until
        <= now()
    returning lock_key
  `;

  return result.rows[0]?.lock_key === "catalogue";
}

export async function releaseCatalogueSnapshotRefreshLock(): Promise<void> {
  await sql`
    update airtable_content_refresh_locks
    set
      locked_until = now(),
      updated_at = now()
    where lock_key = 'catalogue'
  `;
}

export async function writeCatalogueContentSnapshots(
  input: SnapshotWriteInput,
): Promise<AirtableContentSnapshotMetadata[]> {
  if (
    !Number.isInteger(input.syncCatalogue.itemCount) ||
    input.syncCatalogue.itemCount < 0 ||
    !Number.isInteger(input.websiteCatalogue.itemCount) ||
    input.websiteCatalogue.itemCount < 0
  ) {
    throw new Error(
      "Snapshot item counts must be non-negative integers",
    );
  }

  const syncPayload = serializePayload(
    input.syncCatalogue.payload,
    "sync catalogue",
  );

  const websitePayload = serializePayload(
    input.websiteCatalogue.payload,
    "website catalogue",
  );

  const syncHash = hashPayload(syncPayload);
  const websiteHash = hashPayload(websitePayload);

  const result = await sql<SnapshotRow>`
    insert into airtable_content_snapshots (
      snapshot_key,
      payload,
      item_count,
      source_hash,
      refreshed_at
    )
    values
      (
        'sync_catalogue',
        ${syncPayload}::jsonb,
        ${input.syncCatalogue.itemCount},
        ${syncHash},
        now()
      ),
      (
        'website_catalogue',
        ${websitePayload}::jsonb,
        ${input.websiteCatalogue.itemCount},
        ${websiteHash},
        now()
      )
    on conflict (snapshot_key) do update set
      payload = excluded.payload,
      item_count = excluded.item_count,
      source_hash = excluded.source_hash,
      refreshed_at = excluded.refreshed_at
    returning
      snapshot_key,
      payload,
      item_count,
      source_hash,
      refreshed_at
  `;

  if (result.rows.length != 2) {
    throw new Error(
      "Snapshot refresh did not persist both catalogue snapshots",
    );
  }

  return result.rows
    .map(mapSnapshotRow)
    .map((snapshot) => ({
      key: snapshot.key,
      itemCount: snapshot.itemCount,
      sourceHash: snapshot.sourceHash,
      refreshedAt: snapshot.refreshedAt,
    }))
    .sort((left, right) =>
      left.key.localeCompare(right.key),
    );
}
