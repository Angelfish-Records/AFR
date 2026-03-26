import type { NextApiRequest, NextApiResponse } from "next";
import { revokeCatalogueShareLink } from "@/lib/catalogue/shareLinks";

type OkResponse = {
  ok: true;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OkResponse | ErrorResponse>
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const id = String(req.query.id ?? "").trim();
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing id" });
    return;
  }

  try {
    const revoked = await revokeCatalogueShareLink(id);

    if (!revoked) {
      res.status(404).json({ ok: false, error: "Share link not found" });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to revoke share link" });
  }
}