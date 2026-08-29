import type {
  NextApiRequest,
  NextApiResponse,
} from "next";
import {
  CatalogueSnapshotRefreshBusyError,
  refreshCatalogueContentSnapshots,
} from "@/lib/catalogue/snapshotRefresh";
import { requireInternalBasicAuth } from "../../_internalAuth";

type RefreshResponse =
  | {
      ok: true;
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
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshResponse>,
): Promise<void> {
  if (!requireInternalBasicAuth(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
    return;
  }

  res.setHeader(
    "Cache-Control",
    "private, no-store",
  );

  try {
    const result =
      await refreshCatalogueContentSnapshots();

    res.status(200).json({
      ok: true,
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
      "[catalogue-snapshot-refresh] failed",
      error instanceof Error
        ? error.message
        : "Unknown error",
    );

    res.status(500).json({
      ok: false,
      error:
        "Catalogue snapshot refresh failed",
    });
  }
}
