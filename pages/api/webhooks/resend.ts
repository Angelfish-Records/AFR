// pages/api/webhooks/resend.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import {Webhook} from 'svix'
import crypto from 'crypto'

export const config = {
  api: {bodyParser: false},
}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

type ResendWebhookEnvelope = {
  type?: string
  created_at?: string
  data?: unknown
}

type ResendEmailEventData = {
  email_id?: string
  from?: string
  to?: string[]
  subject?: string
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object'
}

function looksLikeEmailEventData(x: unknown): x is ResendEmailEventData {
  if (!isObj(x)) return false
  const o = x as Record<string, unknown>
  if ('to' in o && o.to !== undefined && !Array.isArray(o.to)) return false
  return true
}

function lowerEmail(s: string): string {
  return s.trim().toLowerCase()
}

function isoNow(): string {
  return new Date().toISOString()
}

function escapeAirtableString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function emailHash(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 10)
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
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

async function airtableUpsertByUniqueField(args: {
  baseId: string
  table: string
  token: string
  uniqueField: string
  uniqueValue: string
  fields: Record<string, unknown>
}): Promise<void> {
  const {baseId, table, token, uniqueField, uniqueValue, fields} = args

  const filter = encodeURIComponent(`{${uniqueField}} = "${escapeAirtableString(uniqueValue)}"`)
  const searchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${filter}`

  const found = await airtableRequestWithRetry<{records?: Array<{id: string}>}>(token, searchUrl)
  if (!found.ok) throw new Error(`Airtable search failed: ${found.status} ${found.body}`)
  const existingId = found.json.records?.[0]?.id

  const url = existingId
    ? `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${existingId}`
    : `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
  const method = existingId ? 'PATCH' : 'POST'
  const body = existingId ? {fields} : {records: [{fields}]}

  const write = await airtableRequestWithRetry<unknown>(token, url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  if (!write.ok) throw new Error(`Airtable write failed: ${write.status} ${write.body}`)
}

async function airtableFindPressContactIdByEmail(args: {
  token: string
  baseId: string
  contactsTable: string
  email: string
}): Promise<string | null> {
  const {token, baseId, contactsTable, email} = args
  const filter = encodeURIComponent(`LOWER({Email}) = "${escapeAirtableString(email)}"`)
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(contactsTable)}?maxRecords=1&filterByFormula=${filter}`

  const res = await airtableRequestWithRetry<{records?: Array<{id: string}>}>(token, url)
  if (!res.ok) throw new Error(`Airtable contact lookup failed: ${res.status} ${res.body}`)
  return res.json.records?.[0]?.id ?? null
}

async function airtableSuppressionExists(args: {
  token: string
  baseId: string
  suppressionsTable: string
  contactId: string
  reason: 'Bounced' | 'Complaint'
  startDateIso: string
  resendMessageId: string
}): Promise<boolean> {
  const {token, baseId, suppressionsTable, contactId, reason, startDateIso, resendMessageId} = args
  const startDate = startDateIso.slice(0, 10)

  const filter = encodeURIComponent(
    `AND(FIND("${escapeAirtableString(contactId)}", ARRAYJOIN({Contact})), {Reason}="${escapeAirtableString(
      reason
    )}", {Start date}="${escapeAirtableString(startDate)}", FIND("${escapeAirtableString(
      `resend_message_id=${resendMessageId}`
    )}", {Notes}))`
  )

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    suppressionsTable
  )}?maxRecords=1&filterByFormula=${filter}`

  const res = await airtableRequestWithRetry<{records?: Array<{id: string}>}>(token, url)
  if (!res.ok) throw new Error(`Airtable suppression lookup failed: ${res.status} ${res.body}`)
  return !!res.json.records?.[0]?.id
}

async function airtableCreateSuppression(args: {
  token: string
  baseId: string
  suppressionsTable: string
  contactId: string
  reason: 'Bounced' | 'Complaint'
  startDateIso: string
  notes?: string
}): Promise<void> {
  const {token, baseId, suppressionsTable, contactId, reason, startDateIso, notes} = args

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(suppressionsTable)}`
  const body = {
    records: [
      {
        fields: {
          Contact: [contactId],
          Reason: reason,
          'Start date': startDateIso.slice(0, 10),
          Notes: notes ?? '',
        },
      },
    ],
  }

  const res = await airtableRequestWithRetry<unknown>(token, url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Airtable suppression create failed: ${res.status} ${res.body}`)
}

function mapDeliveryStatus(type: string): 'Sent' | 'Delivered' | 'Bounced' | 'Complained' | 'Failed' | null {
  switch (type) {
    case 'email.sent':
      return 'Sent'
    case 'email.delivered':
      return 'Delivered'
    case 'email.bounced':
      return 'Bounced'
    case 'email.complained':
      return 'Complained'
    case 'email.failed':
      return 'Failed'
    default:
      return null
  }
}

async function airtableUpdateSendByResendMessageId(args: {
  token: string
  baseId: string
  sendsTable: string
  resendMessageId: string
  deliveryStatus: 'Sent' | 'Delivered' | 'Bounced' | 'Complained' | 'Failed'
  lastEventAtIso: string
}): Promise<void> {
  const {token, baseId, sendsTable, resendMessageId, deliveryStatus, lastEventAtIso} = args

  const filter = encodeURIComponent(`{Resend message id} = "${escapeAirtableString(resendMessageId)}"`)
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sendsTable)}?maxRecords=1&filterByFormula=${filter}`

  const found = await airtableRequestWithRetry<{records?: Array<{id: string}>}>(token, url)
  if (!found.ok) throw new Error(`Airtable send lookup failed: ${found.status} ${found.body}`)
  const sendId = found.json.records?.[0]?.id
  if (!sendId) return

  const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sendsTable)}/${sendId}`
  const res = await airtableRequestWithRetry<unknown>(token, patchUrl, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      fields: {
        'Delivery status': deliveryStatus,
        'Last event at': lastEventAtIso,
      },
    }),
  })
  if (!res.ok) throw new Error(`Airtable send update failed: ${res.status} ${res.body}`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  const webhookSecret = must(process.env.AFR_RESEND_WEBHOOK_SECRET, 'AFR_RESEND_WEBHOOK_SECRET')

  const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
  const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')

  const resendEventsTable = must(process.env.AIRTABLE_RESEND_EVENTS_TABLE, 'AIRTABLE_RESEND_EVENTS_TABLE')
  const pressContactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')
  const suppressionsTable = must(process.env.AIRTABLE_SUPPRESSIONS_TABLE, 'AIRTABLE_SUPPRESSIONS_TABLE')
  const sendsTable = must(process.env.AIRTABLE_SENDS_TABLE, 'AIRTABLE_SENDS_TABLE')

  const svixId = (req.headers['svix-id'] as string | undefined) ?? ''
  const svixTimestamp = (req.headers['svix-timestamp'] as string | undefined) ?? ''
  const svixSignature = (req.headers['svix-signature'] as string | undefined) ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) return res.status(400).send('Missing webhook headers')

  const payload = await readRawBody(req)

  try {
    const wh = new Webhook(webhookSecret)
    wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return res.status(400).send('Invalid webhook')
  }

  let event: ResendWebhookEnvelope
  try {
    event = JSON.parse(payload) as ResendWebhookEnvelope
  } catch {
    return res.status(400).send('Invalid JSON payload')
  }

  try {
    const type = typeof event.type === 'string' ? event.type : ''
    const eventCreatedAtIso = event.created_at ? new Date(event.created_at).toISOString() : isoNow()
    const receivedAtIso = isoNow()

    const data = event.data
    const isEmailData = looksLikeEmailEventData(data)

    const resendMessageId = isEmailData && typeof data.email_id === 'string' ? data.email_id : ''
    const from = isEmailData && typeof data.from === 'string' ? data.from : ''
    const toEmail =
      isEmailData && Array.isArray(data.to) && typeof data.to[0] === 'string' ? lowerEmail(data.to[0]) : ''
    const subject = isEmailData && typeof data.subject === 'string' ? data.subject : ''

    // Avoid logging raw PII.
    console.log('[resend-webhook] verified', {svixId, type, to: toEmail ? `sha:${emailHash(toEmail)}` : ''})

    // 1) Immutable event log (idempotent by svix_id)
    await airtableUpsertByUniqueField({
      baseId,
      table: resendEventsTable,
      token: airtableToken,
      uniqueField: 'svix_id',
      uniqueValue: svixId,
      fields: {
        svix_id: svixId,
        event_type: type,
        event_created_at: eventCreatedAtIso,
        resend_message_id: resendMessageId || undefined,
        to_email: toEmail || undefined,
        from: from || undefined,
        subject: subject || undefined,
        raw_json: payload,
        received_at: receivedAtIso,
      },
    })

    // 2) Operational state: update Sends
    const deliveryStatus = mapDeliveryStatus(type)
    if (deliveryStatus && resendMessageId) {
      await airtableUpdateSendByResendMessageId({
        token: airtableToken,
        baseId,
        sendsTable,
        resendMessageId,
        deliveryStatus,
        lastEventAtIso: eventCreatedAtIso,
      })
    }

    // 3) Suppressions (idempotent: search before create)
    if (toEmail && resendMessageId && (type === 'email.bounced' || type === 'email.complained')) {
      const contactId = await airtableFindPressContactIdByEmail({
        token: airtableToken,
        baseId,
        contactsTable: pressContactsTable,
        email: toEmail,
      })

      if (contactId) {
        const reason: 'Bounced' | 'Complaint' = type === 'email.bounced' ? 'Bounced' : 'Complaint'
        const notes = `Auto-created from Resend webhook (${type}). resend_message_id=${resendMessageId}`

        const exists = await airtableSuppressionExists({
          token: airtableToken,
          baseId,
          suppressionsTable,
          contactId,
          reason,
          startDateIso: receivedAtIso,
          resendMessageId,
        })

        if (!exists) {
          await airtableCreateSuppression({
            token: airtableToken,
            baseId,
            suppressionsTable,
            contactId,
            reason,
            startDateIso: receivedAtIso,
            notes,
          })
        }
      }
    }

    return res.status(200).json({ok: true})
  } catch (err) {
    console.error('[resend-webhook] processing failed', err)
    return res.status(500).send('Webhook processing failed: ' + (err instanceof Error ? err.message : String(err)))
  }
}
