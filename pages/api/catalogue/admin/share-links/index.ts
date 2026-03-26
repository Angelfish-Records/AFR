import type { NextApiRequest, NextApiResponse } from "next";
import {
  createCatalogueShareLink,
  listCatalogueShareLinks,
} from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

type CreateBody = {
  recipientName?: string;
  recipientEmail?: string;
  label?: string;
  expiresAt?: string | null;
};

type GetResponse = {
  ok: true;
  links: CatalogueShareLinkSummary[];
};

type PostResponse = {
  ok: true;
  link: CatalogueShareLinkSummary;
  shareUrl: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

function getCreatedBy(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    const user = decoded.slice(0, separatorIndex).trim();
    return user.length > 0 ? user : null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PostResponse | ErrorResponse>
): Promise<void> {
  if (req.method === "GET") {
    try {
      const links = await listCatalogueShareLinks(50);
      res.status(200).json({ ok: true, links });
      return;
    } catch {
      res.status(500).json({ ok: false, error: "Failed to load share links" });
      return;
    }
  }

  if (req.method === "POST") {
    try {
      const body = (req.body ?? {}) as CreateBody;
      const publicBaseUrl = process.env.CATALOGUE_PUBLIC_BASE_URL?.trim();

      if (!publicBaseUrl) {
        res
          .status(500)
          .json({ ok: false, error: "Missing CATALOGUE_PUBLIC_BASE_URL" });
        return;
      }

      const createdBy = getCreatedBy(req);

      const { link, rawToken } = await createCatalogueShareLink({
        recipientName: body.recipientName ?? null,
        recipientEmail: body.recipientEmail ?? null,
        label: body.label ?? null,
        expiresAt: body.expiresAt ?? null,
        createdBy,
      });

      const shareUrl = new URL(publicBaseUrl);
      shareUrl.searchParams.set("st", rawToken);

      res.status(200).json({
        ok: true,
        link,
        shareUrl: shareUrl.toString(),
      });
      return;
    } catch {
      res.status(500).json({ ok: false, error: "Failed to create share link" });
      return;
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ ok: false, error: "Method not allowed" });
}