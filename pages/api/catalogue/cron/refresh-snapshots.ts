import crypto from "crypto";
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";
import {
  readAirtableContentSnapshot,
} from "@/lib/catalogue/contentSnapshots";
import {
  CatalogueSnapshotRefreshBusyError,
  refreshCatalogueContentSnapshots,
  type CatalogueSnapshotRefreshResult,
} from "@/lib/catalogue/snapshotRefresh";

const RECENT_REFRESH_WINDOW_MS =
  2 * 60 * 60 * 1000;

type CronResponse =
  | {
      ok: true;
      skipped: true;
      reason: "recent_snapshot";
    }
  | ({
      ok: true;
      skipped: false;
    } & CatalogueSnapshotRefreshResult)
  | {
      ok: false;
      error: string;
    };

function isAuthorizedCronRequest(
  req: NextApiRequest,
  cronSecret: string,
): boolean {
  const supplied =
    req.headers.authorization ?? "";
  const expected = `Bearer ${cronSecret}`;

  const suppliedBuffer =
    Buffer.from(supplied, "utf8");
  const expectedBuffer =
    Buffer.from(expected, "utf8");

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer,
    )
  );
}

async function wereSnapshotsRefreshedRecently(): Promise<boolean> {
  const [syncSnapshot, websiteSnapshot] =
    await Promise.all([
      readAirtableContentSnapshot(
        "sync_catalogue",
      ),
      readAirtableContentSnapshot(
        "website_catalogue",
      ),
    ]);

  if (!syncSnapshot || !websiteSnapshot) {
    return false;
  }

  const now = Date.now();

  return [syncSnapshot, websiteSnapshot].every(
    (snapshot) => {
      const refreshedAt =
        new Date(snapshot.refreshedAt).getTime();

      return (
        Number.isFinite(refreshedAt) &&
        now - refreshedAt >= 0 &&
        now - refreshedAt <
          RECENT_REFRESH_WINDOW_MS
      );
    },
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>,
): Promise<void> {
  res.setHeader(
    "Cache-Control",
    "private, no-store",
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
    return;
  }

  const cronSecret =
    process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      "[catalogue-snapshot-cron] CRON_SECRET is not configured",
    );

    res.status(500).json({
      ok: false,
      error: "Cron authentication is not configured",
    });
    return;
  }

  if (
    !isAuthorizedCronRequest(
      req,
      cronSecret,
    )
  ) {
    res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
    return;
  }

  try {
    if (
      await wereSnapshotsRefreshedRecently()
    ) {
      res.status(200).json({
        ok: true,
        skipped: true,
        reason: "recent_snapshot",
      });
      return;
    }

    const result =
      await refreshCatalogueContentSnapshots();

    console.info(
      "[catalogue-snapshot-cron] refresh complete",
      {
        syncItemCount:
          result.syncCatalogue.itemCount,
        websiteItemCount:
          result.websiteCatalogue.itemCount,
        airtablePageCount:
          result.totalAirtablePageCount,
      },
    );

    res.status(200).json({
      ok: true,
      skipped: false,
      ...result,
    });
  } catch (error) {
    if (
      error instanceof
      CatalogueSnapshotRefreshBusyError
    ) {
      res.status(409).json({
        ok: false,
        error:
          "Catalogue snapshot refresh already in progress",
      });
      return;
    }

    console.error(
      "[catalogue-snapshot-cron] refresh failed",
      error instanceof Error
        ? error.message
        : "Unknown error",
    );

    res.status(500).json({
      ok: false,
      error:
        "Catalogue snapshot cron refresh failed",
    });
  }
}
