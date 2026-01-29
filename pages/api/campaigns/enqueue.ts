// pages/api/campaigns/enqueue.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import crypto from 'crypto'
import { requireInternalBasicAuth } from '../_internalAuth'

type AirtableListResp<TFields> = {
  records: Array<{id: string; fields: TFields}>
  offset?: string
}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function jsonError(res: NextApiResponse, status: number, msg: string, extra?: unknown) {
  return res.status(status).json({error: msg, ...(extra ? {extra} : {})})
}

function escapeAirtableString(s: string): string {
  // safe inside Airtable string literal "..."
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeFilterValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function buildContactsFilter(args: {outletType?: string; outletRegion?: string}): string {
  const parts: string[] = ['{Is mailable}']

  const t = (args.outletType ?? '').trim()
  if (t) parts.push(`FIND("${escapeAirtableString(t)}", ARRAYJOIN({Outlet Type}))`)

  const r = (args.outletRegion ?? '').trim()
  if (r) parts.push(`FIND("${escapeAirtableString(r)}", ARRAYJOIN({Outlet Region}))`)

  return parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`
}

function isValidEmailLoose(s: string): boolean {
  const x = s.trim()
  if (x.length < 3 || x.length > 254) return false
  const at = x.indexOf('@')
  if (at <= 0 || at !== x.lastIndexOf('@')) return false
  const dot = x.lastIndexOf('.')
  return dot > at + 1 && dot < x.length - 1
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

// Accept either "Name <a@b>" or "a@b"
function extractEmailFromFromAddress(s: string): string | null {
  const trimmed = s.trim()
  const m = trimmed.match(/<([^>]+)>/)
  const candidate = (m?.[1] ?? trimmed).trim()
  return isValidEmailLoose(candidate) ? candidate : null
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

async function airtableListAll<TFields>(args: {
  token: string
  baseId: string
  table: string
  filterByFormula?: string
  fields?: string[]
  pageSize?: number
  maxRecords?: number
}): Promise<Array<{id: string; fields: TFields}>> {
  const {token, baseId, table, filterByFormula, fields, pageSize = 100, maxRecords} = args
  const out: Array<{id: string; fields: TFields}> = []

  let offset: string | undefined
  while (true) {
    const params = new URLSearchParams()
    params.set('pageSize', String(Math.min(100, Math.max(1, pageSize))))
    if (filterByFormula) params.set('filterByFormula', filterByFormula)
    if (fields?.length) for (const f of fields) params.append('fields[]', f)
    if (offset) params.set('offset', offset)

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params.toString()}`
    const resp = await airtableRequestWithRetry<AirtableListResp<TFields>>(token, url)
    if (!resp.ok) throw new Error(`Airtable list failed: ${resp.status} ${resp.body}`)

    out.push(...resp.json.records)
    offset = resp.json.offset

    if (maxRecords && out.length >= maxRecords) return out.slice(0, maxRecords)
    if (!offset) return out
  }
}

async function airtableCreateRecords(args: {
  token: string
  baseId: string
  table: string
  records: Array<{fields: Record<string, unknown>}>
}): Promise<Array<{id: string}>> {
  const {token, baseId, table, records} = args
  const created: Array<{id: string}> = []

  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
    const resp = await airtableRequestWithRetry<{records: Array<{id: string}>}>(token, url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({records: chunk}),
    })
    if (!resp.ok) throw new Error(`Airtable create failed: ${resp.status} ${resp.body}`)
    created.push(...resp.json.records.map((r) => ({id: r.id})))
  }

  return created
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

type PressContactFields = {
  Email?: string
  Outlets?: string[]
  'Outlet Type'?: string[] // lookup array from Outlets.Type
  'Outlet Region'?: string[] // lookup array from Outlets.Region
  'Full name'?: string
  'First name'?: string
  'Last name'?: string
  'One-line hook'?: string
  'Custom paragraph'?: string
}

type OutletFields = {
  Outlet?: string
}

type SendFields = {
  Recipient?: string
  'Delivery status'?: string
  Contact?: string[]
  Pitch?: unknown
}

type SenderKey = 'angus' | 'brendan'

const SENDERS: Record<SenderKey, {fromAddress: string; replyTo: string}> = {
  angus: {
    fromAddress: 'Angus at Angelfish Records <angus@press.angelfishrecords.com>',
    replyTo: 'angus@press.angelfishrecords.com',
  },
  brendan: {
    fromAddress: 'Brendan at Angelfish Records <brendan@press.angelfishrecords.com>',
    replyTo: 'brendan@press.angelfishrecords.com',
  },
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function parseSenderKey(v: unknown): SenderKey | null {
  const s = asString(v).trim()
  if (s === 'angus' || s === 'brendan') return s
  return null
}

function normalizeAudienceKey(k: string | undefined): string {
  return (k ?? 'press_mailable_v1').trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!requireInternalBasicAuth(req, res)) return

    const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')

    const contactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')
    const campaignsTable = must(process.env.AIRTABLE_CAMPAIGNS_TABLE, 'AIRTABLE_CAMPAIGNS_TABLE')
    const sendsTable = must(process.env.AIRTABLE_SENDS_TABLE, 'AIRTABLE_SENDS_TABLE')
    const outletsTable = process.env.AIRTABLE_OUTLETS_TABLE // optional

    const audienceKey = normalizeAudienceKey(
      (req.method === 'GET' ? (req.query.audienceKey as string | undefined) : undefined) ??
        (typeof (req.body as {audienceKey?: unknown} | undefined)?.audienceKey === 'string'
          ? (req.body as {audienceKey: string}).audienceKey
          : undefined)
    )

    if (audienceKey !== 'press_mailable_v1') return jsonError(res, 400, 'Unknown audienceKey')

    // GET query filters
    const outletTypeQ = req.method === 'GET' ? normalizeFilterValue(req.query.outletType) : ''
    const outletRegionQ = req.method === 'GET' ? normalizeFilterValue(req.query.outletRegion) : ''

    if (req.method === 'GET') {
      const contactsFilter = buildContactsFilter({outletType: outletTypeQ, outletRegion: outletRegionQ})

      const sampleContacts = await airtableListAll<PressContactFields>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: contactsFilter,
        fields: [
          'Full name',
          'First name',
          'Last name',
          'Email',
          'Outlets',
          'Outlet Type',
          'Outlet Region',
          'One-line hook',
          'Custom paragraph',
        ],
        maxRecords: 12,
      })

      let outletNameById: Record<string, string> = {}
      if (outletsTable) {
        const outletIds = Array.from(
          new Set(sampleContacts.flatMap((c) => (Array.isArray(c.fields.Outlets) ? c.fields.Outlets : [])))
        ).slice(0, 50)

        if (outletIds.length) {
          const or = outletIds.map((id) => `RECORD_ID()="${escapeAirtableString(id)}"`).join(',')
          const outletRecs = await airtableListAll<OutletFields>({
            token: airtableToken,
            baseId,
            table: outletsTable,
            filterByFormula: `OR(${or})`,
            fields: ['Outlet'],
            maxRecords: outletIds.length,
          })
          outletNameById = Object.fromEntries(outletRecs.map((r) => [r.id, (r.fields.Outlet ?? '').toString()]))
        }
      }

      const all = await airtableListAll<Record<string, never>>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: contactsFilter,
        fields: [],
      })

      // Facets from the full mailable set (unfiltered), so dropdowns stay complete.
      const allForFacet = await airtableListAll<Pick<PressContactFields, 'Outlet Type' | 'Outlet Region'>>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: '{Is mailable}',
        fields: ['Outlet Type', 'Outlet Region'],
      })

      const typeSet = new Set<string>()
      const regionSet = new Set<string>()

      for (const rec of allForFacet) {
        const ts = Array.isArray(rec.fields['Outlet Type']) ? rec.fields['Outlet Type'] : []
        for (const t of ts) if (typeof t === 'string' && t.trim()) typeSet.add(t.trim())

        const rs = Array.isArray(rec.fields['Outlet Region']) ? rec.fields['Outlet Region'] : []
        for (const r of rs) if (typeof r === 'string' && r.trim()) regionSet.add(r.trim())
      }

      const availableOutletTypes = Array.from(typeSet).sort((a, b) => a.localeCompare(b))
      const availableOutletRegions = Array.from(regionSet).sort((a, b) => a.localeCompare(b))

      const sample = sampleContacts
        .filter((c) => !!c.fields.Email)
        .map((c) => {
          const firstOutletId = Array.isArray(c.fields.Outlets) ? c.fields.Outlets[0] : undefined
          return {
            id: c.id,
            email: (c.fields.Email ?? '').toString(),
            firstName: (c.fields['First name'] ?? '').toString(),
            lastName: (c.fields['Last name'] ?? '').toString(),
            fullName: (c.fields['Full name'] ?? '').toString(),
            outlet: firstOutletId ? outletNameById[firstOutletId] ?? '' : '',
            oneLineHook: (c.fields['One-line hook'] ?? '').toString(),
            customParagraph: (c.fields['Custom paragraph'] ?? '').toString(),
          }
        })
        .slice(0, 10)

      return res.status(200).json({
        ok: true,
        audienceKey,
        mailableCount: all.length,
        sampleContacts: sample,
        availableOutletTypes,
        availableOutletRegions,
        appliedFilters: {
          outletType: outletTypeQ || null,
          outletRegion: outletRegionQ || null,
        },
      })
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const body = (req.body ?? {}) as Record<string, unknown>

    const campaignName = typeof body.campaignName === 'string' ? body.campaignName : undefined
    const senderKey = parseSenderKey(body.senderKey) ?? 'brendan'

    const legacyFromAddress = typeof body.fromAddress === 'string' ? body.fromAddress : undefined
    const legacyReplyTo = typeof body.replyTo === 'string' ? body.replyTo : undefined

    const subjectTemplate = typeof body.subjectTemplate === 'string' ? body.subjectTemplate : undefined
    const bodyTemplate = typeof body.bodyTemplate === 'string' ? body.bodyTemplate : undefined
    const existingCampaignId = typeof body.campaignId === 'string' ? body.campaignId : undefined

    // POST body filters
    const outletType = normalizeFilterValue((body as {outletType?: unknown}).outletType)
    const outletRegion = normalizeFilterValue((body as {outletRegion?: unknown}).outletRegion)
    const contactsFilter = buildContactsFilter({outletType, outletRegion})

    if (!subjectTemplate || !bodyTemplate) {
      return jsonError(res, 400, 'Missing required fields: subjectTemplate, bodyTemplate')
    }

    const derived = SENDERS[senderKey]
    const fromAddress = derived.fromAddress
    const replyTo = derived.replyTo

    // Optional: guard against mixed/legacy inputs silently diverging
    if (legacyFromAddress && legacyFromAddress.trim() && legacyFromAddress.trim() !== fromAddress) {
      return jsonError(res, 400, 'fromAddress must not be provided when senderKey is set (or must match senderKey)')
    }
    if (legacyReplyTo && legacyReplyTo.trim() && legacyReplyTo.trim() !== replyTo) {
      return jsonError(res, 400, 'replyTo must not be provided when senderKey is set (or must match senderKey)')
    }

    const fromEmail = extractEmailFromFromAddress(fromAddress)
    if (!fromEmail) return jsonError(res, 400, 'Configured sender fromAddress is invalid')
    if (!isValidEmailLoose(replyTo)) return jsonError(res, 400, 'Configured sender replyTo is invalid')

    const runId = crypto.randomUUID()

    const campaignId =
      existingCampaignId && existingCampaignId.trim()
        ? existingCampaignId.trim()
        : await airtableCreateSingle({
            token: airtableToken,
            baseId,
            table: campaignsTable,
            fields: {
              'Campaign/Pitch':
                campaignName && campaignName.trim() ? campaignName.trim() : subjectTemplate.trim().slice(0, 120),
              'Email subject template': subjectTemplate,
              'Email body template': bodyTemplate,
              Status: 'Ready',
              'Audience key': audienceKey,
            },
          })

    // Pull mailable contacts (email + link id) WITH applied filters
    const contacts = await airtableListAll<PressContactFields>({
      token: airtableToken,
      baseId,
      table: contactsTable,
      filterByFormula: contactsFilter,
      fields: ['Email'],
    })

    const recipients = contacts
      .map((c) => ({contactId: c.id, email: normalizeEmail((c.fields.Email ?? '').toString())}))
      .filter((x) => isValidEmailLoose(x.email))

    if (recipients.length === 0) {
      return res.status(200).json({
        ok: true,
        audienceKey,
        campaignId,
        enqueued: 0,
        skippedInvalid: contacts.length,
        runId,
        note: 'No valid emails found in Press Contacts for the applied filters.',
      })
    }

    // Idempotency/dedupe: find existing sends for this campaign (by campaign record id in linked field)
    const existing = await airtableListAll<SendFields>({
      token: airtableToken,
      baseId,
      table: sendsTable,
      filterByFormula: `FIND("${escapeAirtableString(campaignId)}", ARRAYJOIN({Pitch}))`,
      fields: ['Recipient'],
    })

    const existingEmails = new Set(
      existing.map((s) => normalizeEmail((s.fields.Recipient ?? '').toString())).filter((e) => isValidEmailLoose(e))
    )

    const toCreate = recipients.filter((r) => !existingEmails.has(r.email))

    // Create sends queued (store contact link and runId in Notes for auditability without schema changes)
    const sendRecords = toCreate.map((x) => ({
      fields: {
        Pitch: [campaignId],
        Recipient: x.email,
        'From address': fromAddress,
        'Reply-to': replyTo,
        'Delivery status': 'Queued',
        Contact: [x.contactId],
        Notes: `enqueue_run_id=${runId}`,
      },
    }))

    const created = sendRecords.length
      ? await airtableCreateRecords({
          token: airtableToken,
          baseId,
          table: sendsTable,
          records: sendRecords,
        })
      : []

    return res.status(200).json({
      ok: true,
      audienceKey,
      campaignId,
      enqueued: created.length,
      dedupedExisting: recipients.length - toCreate.length,
      runId,
    })
  } catch (err) {
    console.error('[campaigns/enqueue] failed', err)
    return res.status(500).json({
      error: 'Enqueue failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
