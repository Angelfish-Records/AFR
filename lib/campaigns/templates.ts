// lib/campaigns/templates.ts
export function mergeTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => vars[key] ?? "",
  );
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizePersonalUrl(value: unknown): string | null {
  const raw = asString(value).trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function templateUsesPersonalUrl(template: string): boolean {
  return /\{\{\s*personal_url\s*\}\}/i.test(template);
}

export function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (typeof v === "string") {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

export function jsonRecordValue(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = typeof raw === "string" ? raw : "";
  }

  return out;
}

export function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;

  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
