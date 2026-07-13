// lib/campaigns/airtable.ts
export type AirtableListResp<TFields> = {
  records: Array<{ id: string; fields: TFields }>;
  offset?: string;
};

export type AirtableWriteResp = {
  records: Array<{ id: string }>;
};

export function mustEnv(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function escapeAirtableString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function normalizeFilterValue(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseRetryAfterMs(headers: Headers): number | null {
  const ra = headers.get("retry-after");
  if (!ra) return null;

  const asInt = Number(ra);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(30_000, Math.floor(asInt * 1000));
  }

  const asDate = Date.parse(ra);
  if (Number.isFinite(asDate)) {
    return Math.min(30_000, Math.max(0, asDate - Date.now()));
  }

  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function airtableRequest<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<
  | { ok: true; json: T }
  | { ok: false; status: number; body: string; headers: Headers }
> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body, headers: res.headers };
  }

  const json = (await res.json()) as T;
  return { ok: true, json };
}

export async function airtableRequestWithRetry<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<
  | { ok: true; json: T }
  | { ok: false; status: number; body: string; headers: Headers }
> {
  let attempt = 0;
  let last: { ok: false; status: number; body: string; headers: Headers } | null =
    null;

  while (attempt < 4) {
    attempt++;
    const resp = await airtableRequest<T>(token, url, init);
    if (resp.ok) return resp;

    last = resp;
    const retryable =
      resp.status === 429 ||
      resp.status === 502 ||
      resp.status === 503 ||
      resp.status === 504;

    if (!retryable) return resp;

    const raMs = parseRetryAfterMs(resp.headers);
    const backoff = Math.min(8000, 400 * Math.pow(2, attempt - 1));
    await sleep(raMs ?? backoff);
  }

  return (
    last ?? { ok: false, status: 500, body: "unknown", headers: new Headers() }
  );
}

export async function airtableListAll<TFields>(args: {
  token: string;
  baseId: string;
  table: string;
  filterByFormula?: string;
  fields?: string[];
  pageSize?: number;
  maxRecords?: number;
}): Promise<Array<{ id: string; fields: TFields }>> {
  const {
    token,
    baseId,
    table,
    filterByFormula,
    fields,
    pageSize = 100,
    maxRecords,
  } = args;

  const out: Array<{ id: string; fields: TFields }> = [];
  let offset: string | undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set("pageSize", String(Math.min(100, Math.max(1, pageSize))));
    if (filterByFormula) params.set("filterByFormula", filterByFormula);
    if (fields?.length) for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
      table,
    )}?${params.toString()}`;

    const resp = await airtableRequestWithRetry<AirtableListResp<TFields>>(
      token,
      url,
    );

    if (!resp.ok) {
      throw new Error(`Airtable list failed: ${resp.status} ${resp.body}`);
    }

    out.push(...resp.json.records);
    offset = resp.json.offset;

    if (maxRecords && out.length >= maxRecords) return out.slice(0, maxRecords);
    if (!offset) return out;
  }
}

export async function airtableCreateSingle(args: {
  token: string;
  baseId: string;
  table: string;
  fields: Record<string, unknown>;
}): Promise<string> {
  const { token, baseId, table, fields } = args;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;

  const resp = await airtableRequestWithRetry<AirtableWriteResp>(token, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!resp.ok) {
    throw new Error(`Airtable create failed: ${resp.status} ${resp.body}`);
  }

  const id = resp.json.records?.[0]?.id;
  if (!id) throw new Error("Airtable create returned no record id");
  return id;
}

export async function airtablePatchSingle(args: {
  token: string;
  baseId: string;
  table: string;
  recordId: string;
  fields: Record<string, unknown>;
}): Promise<void> {
  const { token, baseId, table, recordId, fields } = args;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    table,
  )}/${encodeURIComponent(recordId)}`;

  const resp = await airtableRequestWithRetry<unknown>(token, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!resp.ok) {
    throw new Error(`Airtable patch failed: ${resp.status} ${resp.body}`);
  }
}

export async function airtablePatchRecords(args: {
  token: string;
  baseId: string;
  table: string;
  records: Array<{ id: string; fields: Record<string, unknown> }>;
}): Promise<void> {
  const { token, baseId, table, records } = args;

  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
      table,
    )}`;

    const resp = await airtableRequestWithRetry<unknown>(token, url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: chunk }),
    });

    if (!resp.ok) {
      throw new Error(`Airtable patch failed: ${resp.status} ${resp.body}`);
    }
  }
}
