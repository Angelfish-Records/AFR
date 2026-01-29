// pages/api/unsubscribe.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import crypto from 'crypto'

type AirtableListResp<TFields> = {
  records: Array<{id: string; fields: TFields}>
  offset?: string
}

type SuppressionFields = {
  Contact?: string[]
  Reason?: string
  Active?: boolean
  'Start date'?: string
  'End date'?: string
  Notes?: string
}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function escapeAirtableString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64urlDecodeToBuffer(s: string): Buffer | null {
  try {
    const padLen = (4 - (s.length % 4)) % 4
    const padded = (s + '='.repeat(padLen)).replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(padded, 'base64')
  } catch {
    return null
  }
}

function hmacSha256(secret: string, msg: string): Buffer {
  return crypto.createHmac('sha256', secret).update(msg).digest()
}

type UnsubTokenPayload = {
  v: 1
  cid: string // contact record id (rec...)
  em: string // normalized email (for sanity/audit)
  exp: number // unix seconds
  sid?: string // send record id (rec...) optional
  camp?: string // campaign record id (rec...) optional
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

function parseToken(token: string, secret: string): {ok: true; p: UnsubTokenPayload} | {ok: false; reason: string} {
  const parts = token.split('.')
  if (parts.length !== 2) return {ok: false, reason: 'Bad token shape'}
  const [payloadB64, sigB64] = parts

  const expectSig = base64urlEncode(hmacSha256(secret, payloadB64))
  if (!safeEqual(sigB64, expectSig)) return {ok: false, reason: 'Bad signature'}

  const payloadBuf = base64urlDecodeToBuffer(payloadB64)
  if (!payloadBuf) return {ok: false, reason: 'Bad payload encoding'}

  let p: UnsubTokenPayload
  try {
    p = JSON.parse(payloadBuf.toString('utf8')) as UnsubTokenPayload
  } catch {
    return {ok: false, reason: 'Bad payload JSON'}
  }

  if (!p || p.v !== 1) return {ok: false, reason: 'Unsupported token version'}
  if (typeof p.cid !== 'string' || !p.cid.startsWith('rec')) return {ok: false, reason: 'Bad contact id'}
  if (typeof p.em !== 'string' || !p.em.includes('@')) return {ok: false, reason: 'Bad email'}
  if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) return {ok: false, reason: 'Bad expiry'}

  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec > p.exp) return {ok: false, reason: 'Expired'}

  // normalize email for consistency
  p.em = normalizeEmail(p.em)
  return {ok: true, p}
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b0b0c;color:#f2f2f2;">
  <div style="max-width:720px;margin:0 auto;">
    <div style="border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);border-radius:16px;padding:18px 18px;">
      ${body}
    </div>
    <div style="margin-top:14px;opacity:0.7;font-size:12px;">
      Angelfish Records • This link is only for managing press email preferences.
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string))
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

function parseRetryAfterMs(headers: Headers): number | null {
  const ra = headers.get('retry-after')
  if (!ra) return null
  const asInt = Number(ra)
  if (Number.isFinite(asInt) && asInt >= 0) return Math.min(30_000, Math.floor(asInt * 1000))
  const asDate = Date.parse(ra)
  if (Number.isFinite(asDate)) return Math.min(30_000, Math.max(0, asDate - Date.now()))
  return null
}

async function airtableRequest<T>(
  token: string,
  url: string,
  init?: RequestInit
): Promise<{ok: true; json: T} | {ok: false; status: number; body: string; headers: Headers}> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {ok: false, status: res.status, body, headers: res.headers}
  }
  const json = (await res.json()) as T
  return {ok: true, json}
}

async function airtableRequestWithRetry<T>(
  token: string,
  url: string,
  init?: RequestInit
): Promise<{ok: true; json: T} | {ok: false; status: number; body: string; headers: Headers}> {
  let attempt = 0
  let last: {ok: false; status: number; body: string; headers: Headers} | null = null

  while (attempt < 4) {
    attempt++
    const resp = await airtableRequest<T>(token, url, init)
    if (resp.ok) return resp

    last = resp
    const retryable = resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504
    if (!retryable) return resp

    const raMs = parseRetryAfterMs(resp.headers)
    const backoff = Math.min(8000, 400 * Math.pow(2, attempt - 1))
    await sleep(raMs ?? backoff)
  }

  return last ?? {ok: false, status: 500, body: 'unknown', headers: new Headers()}
}

async function airtableList<TFields>(args: {
  token: string
  baseId: string
  table: string
  filterByFormula?: string
  fields?: string[]
  maxRecords?: number
  pageSize?: number
}): Promise<Array<{id: string; fields: TFields}>> {
  const {token, baseId, table, filterByFormula, fields, maxRecords = 1, pageSize = 100} = args
  const params = new URLSearchParams()
  params.set('pageSize', String(Math.min(100, pageSize)))
  params.set('maxRecords', String(Math.min(100, maxRecords)))
  if (filterByFormula) params.set('filterByFormula', filterByFormula)
  if (fields?.length) for (const f of fields) params.append('fields[]', f)

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params.toString()}`
  const resp = await airtableRequestWithRetry<AirtableListResp<TFields>>(token, url)
  if (!resp.ok) throw new Error(`Airtable list failed: ${resp.status} ${resp.body}`)
  return resp.json.records
}

async function airtableCreateSingle(args: {
  token: string
  baseId: string
  table: string
  fields: Record<string, unknown>
}): Promise<string> {
  const {token, baseId, table, fields} = args
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
  const resp = await airtableRequestWithRetry<{records: Array<{id: string}>}>(token, url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({records: [{fields}]}),
  })
  if (!resp.ok) throw new Error(`Airtable create failed: ${resp.status} ${resp.body}`)
  const id = resp.json.records?.[0]?.id
  if (!id) throw new Error('Airtable create returned no record id')
  return id
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function pickToken(req: NextApiRequest): string {
  // GET: /api/unsubscribe?t=...
  const q = typeof req.query.t === 'string' ? req.query.t : ''
  if (q) return q

  // POST from HTML form: body.t
  const b = req.body as unknown
  if (b && typeof b === 'object' && typeof (b as {t?: unknown}).t === 'string') return (b as {t: string}).t
  return ''
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = pickToken(req)
    if (!token) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(400).send(
        htmlPage(
          'Invalid link',
          `<h1 style="margin:0 0 10px 0;font-size:18px;">Invalid link</h1>
           <div style="opacity:0.85;line-height:1.5;">This unsubscribe link is missing or malformed.</div>`
        )
      )
    }

    const secret = must(process.env.AFR_UNSUBSCRIBE_SECRET, 'AFR_UNSUBSCRIBE_SECRET')
    const parsed = parseToken(token, secret)

    if (!parsed.ok) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(400).send(
        htmlPage(
          'Link expired',
          `<h1 style="margin:0 0 10px 0;font-size:18px;">This link can’t be used</h1>
           <div style="opacity:0.85;line-height:1.5;">
             It may have expired or been copied incorrectly. If you still want to opt out, reply to the email and ask us to stop.
           </div>`
        )
      )
    }

    const p = parsed.p

    // GET = confirmation page (scanner-resistant)
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(200).send(
        htmlPage(
          'Confirm unsubscribe',
          `<h1 style="margin:0 0 10px 0;font-size:18px;">Unsubscribe from Angelfish Records press emails?</h1>
           <div style="opacity:0.85;line-height:1.5;margin-bottom:14px;">
             Email: <b>${escapeHtml(p.em)}</b>
           </div>
           <form method="POST" action="/api/unsubscribe">
             <input type="hidden" name="t" value="${escapeHtml(token)}" />
             <button type="submit" style="cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.10);color:#fff;padding:10px 14px;border-radius:12px;font-weight:600;">
               Confirm unsubscribe
             </button>
           </form>
           <div style="margin-top:12px;opacity:0.7;font-size:12px;line-height:1.5;">
             This is a cold outreach list; we’ll treat this as “do not contact” going forward.
           </div>`
        )
      )
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')
    const suppressionsTable = must(process.env.AIRTABLE_SUPPRESSIONS_TABLE, 'AIRTABLE_SUPPRESSIONS_TABLE')
    const contactsTable = process.env.AIRTABLE_PRESS_CONTACTS_TABLE // optional if you later want to also patch Contact status

    // Dedup: already has active Unsubscribed suppression?
    const cidEsc = escapeAirtableString(p.cid)
    const filter = `AND(FIND("${cidEsc}", ARRAYJOIN({Contact})), {Reason}="Unsubscribed", {Active})`

    const existing = await airtableList<Pick<SuppressionFields, 'Reason' | 'Active'>>({
      token: airtableToken,
      baseId,
      table: suppressionsTable,
      filterByFormula: filter,
      fields: ['Reason', 'Active'],
      maxRecords: 1,
    })

    if (!existing.length) {
      const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : ''
      const note = [
        `unsubscribed_via=link`,
        `email=${p.em}`,
        p.sid ? `send_id=${p.sid}` : '',
        p.camp ? `campaign_id=${p.camp}` : '',
        ua ? `user_agent=${ua.slice(0, 220)}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      await airtableCreateSingle({
        token: airtableToken,
        baseId,
        table: suppressionsTable,
        fields: {
          Contact: [p.cid],
          Reason: 'Unsubscribed',
          'Start date': todayYmd(),
          Notes: note.slice(0, 90000),
        },
      })

      // Optional: also patch Press Contacts.Contact status => Unsubscribed for visibility.
      // Your "Is mailable" formula already excludes Unsubscribed contacts, so this is fine,
      // but we keep it optional so you can decide whether you want the double-mark.
      // (If you want this now, tell me and I’ll add the PATCH helper here.)
      void contactsTable
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(
      htmlPage(
        'Unsubscribed',
        `<h1 style="margin:0 0 10px 0;font-size:18px;">You’re unsubscribed.</h1>
         <div style="opacity:0.85;line-height:1.5;">
           We won’t send further press emails to <b>${escapeHtml(p.em)}</b>.
         </div>`
      )
    )
  } catch (err) {
    console.error('[unsubscribe] failed', err)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(500).send(
      htmlPage(
        'Error',
        `<h1 style="margin:0 0 10px 0;font-size:18px;">Something went wrong</h1>
         <div style="opacity:0.85;line-height:1.5;">Please reply to the email and ask us to stop.</div>`
      )
    )
  }
}
