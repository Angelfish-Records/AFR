import type { NextApiRequest, NextApiResponse } from "next";
import { hasCatalogueApiAccess } from "@/lib/catalogue/access";
import {
  getCatalogueRecordByRecordingId,
} from "@/lib/catalogue/queries";
import type { CatalogueDetailResponse } from "@/lib/catalogue/api";

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CatalogueDetailResponse | ErrorResponse>
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

  const { recordingId } = req.query;

  if (typeof recordingId !== "string" || recordingId.trim().length === 0) {
    res.status(400).json({ error: "Invalid recordingId" });
    return;
  }

  try {
    const record = await getCatalogueRecordByRecordingId(recordingId);

    if (!record) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ record });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown catalogue error";

    res.status(500).json({ error: message });
  }
}