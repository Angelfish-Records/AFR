import {
  releaseCatalogueSnapshotRefreshLock,
  tryAcquireCatalogueSnapshotRefreshLock,
  writeCatalogueContentSnapshots,
  type AirtableContentSnapshotKey,
  type AirtableContentSnapshotMetadata,
} from "@/lib/catalogue/contentSnapshots";
import { fetchCatalogueRecordsFromAirtable } from "@/lib/catalogue/queries";
import { fetchWebsiteCatalogueReleasesFromAirtable } from "@/lib/website-catalogue";

export class CatalogueSnapshotRefreshBusyError extends Error {
  constructor() {
    super(
      "A catalogue snapshot refresh is already in progress",
    );
    this.name = "CatalogueSnapshotRefreshBusyError";
  }
}

export type CatalogueSnapshotRefreshResult = {
  syncCatalogue: {
    itemCount: number;
    airtablePageCount: number;
    refreshedAt: string;
  };
  websiteCatalogue: {
    itemCount: number;
    airtablePageCount: number;
    refreshedAt: string;
  };
  totalAirtablePageCount: number;
};

function requireMetadata(
  metadata: AirtableContentSnapshotMetadata[],
  key: AirtableContentSnapshotKey,
): AirtableContentSnapshotMetadata {
  const match = metadata.find(
    (item) => item.key === key,
  );

  if (!match) {
    throw new Error(
      `Snapshot metadata missing for "${key}"`,
    );
  }

  return match;
}

export async function refreshCatalogueContentSnapshots(): Promise<CatalogueSnapshotRefreshResult> {
  const acquired =
    await tryAcquireCatalogueSnapshotRefreshLock();

  if (!acquired) {
    throw new CatalogueSnapshotRefreshBusyError();
  }

  try {
    const [syncResult, websiteResult] =
      await Promise.all([
        fetchCatalogueRecordsFromAirtable(),
        fetchWebsiteCatalogueReleasesFromAirtable(),
      ]);

    if (syncResult.records.length === 0) {
      throw new Error(
        "Refusing to replace the last-known-good sync catalogue with an empty Airtable result",
      );
    }

    if (websiteResult.releases.length === 0) {
      throw new Error(
        "Refusing to replace the last-known-good website catalogue with an empty Airtable result",
      );
    }

    const metadata =
      await writeCatalogueContentSnapshots({
        syncCatalogue: {
          payload: syncResult.records,
          itemCount: syncResult.records.length,
        },
        websiteCatalogue: {
          payload: websiteResult.releases,
          itemCount: websiteResult.releases.length,
        },
      });

    const syncMetadata = requireMetadata(
      metadata,
      "sync_catalogue",
    );

    const websiteMetadata = requireMetadata(
      metadata,
      "website_catalogue",
    );

    return {
      syncCatalogue: {
        itemCount: syncMetadata.itemCount,
        airtablePageCount: syncResult.pageCount,
        refreshedAt: syncMetadata.refreshedAt,
      },
      websiteCatalogue: {
        itemCount: websiteMetadata.itemCount,
        airtablePageCount: websiteResult.pageCount,
        refreshedAt: websiteMetadata.refreshedAt,
      },
      totalAirtablePageCount:
        syncResult.pageCount +
        websiteResult.pageCount,
    };
  } finally {
    await releaseCatalogueSnapshotRefreshLock();
  }
}
