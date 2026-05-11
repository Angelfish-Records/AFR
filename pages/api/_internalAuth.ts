// pages/api/_internalAuth.ts
import type { NextApiRequest, NextApiResponse } from "next";

export function requireInternalBasicAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  const credentials = [
    {
      user: process.env.INTERNAL_BASIC_AUTH_USER,
      pass: process.env.INTERNAL_BASIC_AUTH_PASS,
    },
    {
      user: process.env.INTERNAL_BASIC_AUTH_USER_2,
      pass: process.env.INTERNAL_BASIC_AUTH_PASS_2,
    },
  ].filter(
    (pair): pair is { user: string; pass: string } =>
      Boolean(pair.user) && Boolean(pair.pass),
  );

  if (credentials.length === 0) {
    res.status(401).json({ error: "Internal auth not configured" });
    return false;
  }
  const auth = req.headers.authorization || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="AFR Internal", charset="UTF-8"',
    );
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    res.status(401).json({ error: "Invalid authorization header" });
    return false;
  }

  const idx = decoded.indexOf(":");
  const u = idx >= 0 ? decoded.slice(0, idx) : "";
  const p = idx >= 0 ? decoded.slice(idx + 1) : "";

  const matched = credentials.some(
    (pair) => u === pair.user && p === pair.pass,
  );

  if (!matched) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="AFR Internal", charset="UTF-8"',
    );
    res.status(401).json({ error: "Invalid credentials" });
    return false;
  }

  return true;
}
