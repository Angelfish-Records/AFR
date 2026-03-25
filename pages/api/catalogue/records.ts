import type { NextApiRequest, NextApiResponse } from "next";
import { toCatalogueListItem, type CatalogueListResponse } from "@/lib/catalogue/api";
import { hasCatalogueApiAccess } from "@/lib/catalogue/access";
import { listCatalogueRecords } from "@/lib/catalogue/queries";

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CatalogueListResponse | ErrorResponse>
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!hasCatalogueApiAccess(req)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const records = await listCatalogueRecords();
    const payload: CatalogueListResponse = {
      records: records.map(toCatalogueListItem),
      count: records.length,
    };

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown catalogue error";

    res.status(500).json({ error: message });
  }
}