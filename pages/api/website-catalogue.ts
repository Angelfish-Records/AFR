import type { NextApiRequest, NextApiResponse } from "next";
import {
  listWebsiteCatalogueReleases,
  type WebsiteCatalogueResponse,
} from "@/lib/website-catalogue";

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebsiteCatalogueResponse | ErrorResponse>,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const releases = await listWebsiteCatalogueReleases();

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );

    res.status(200).json({
      releases,
      count: releases.length,
    });
  } catch (error) {
    console.error("[website-catalogue] failed", {
      message:
        error instanceof Error
          ? error.message
          : "Unknown website catalogue error",
    });

    res.status(500).json({
      error: "Failed to load website catalogue",
    });
  }
}
