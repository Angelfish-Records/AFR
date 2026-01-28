// pages/api/campaigns/drain.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import crypto from 'crypto'
import {Resend} from 'resend'
import {render as renderEmail} from '@react-email/render'
import PressPitchEmail from '../../../emails/PressPitchEmail'
import * as React from 'react'

type AirtableListResp<TFields> = {
  records: Array<{id: string; fields: TFields}>
  offset?: string
}

type SendFields = {
  Recipient?: string
  'From address'?: string
  'Reply-to'?: string
  'Resend message id'?: string
  'Delivery status'?: string
  'Sent at'?: string
  'Last event at'?: string
  Notes?: string
  'Personalised paragraph used'?: string
  Contact?: string[]
  Pitch?: unknown
}

type ContactFields = {
  'Full name'?: string
  'First name'?: string
  'Last name'?: string
  Email?: string
  'One-line hook'?: string
  'Custom paragraph'?: string
}

type CampaignFields = {
  'Email subject template'?: string
  'Email body template'?: string
  'Default CTA'?: string
  'Key links'?: string
  'Assets pack link'?: string
  'Campaign/Pitch'?: string
  Status?: string
  'Sent at'?: string
}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function jsonError(res: NextApiResponse, status: number, msg: string, extra?: unknown) {
  return res.status(status).json({error: msg, ...(extra ? {extra} : {})})
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object'
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isoNow(): string {
  return new Date().toISOString()
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

function allowInternal(req: NextApiRequest): boolean {
  const key = process.env.AFR_INTERNAL_KEY
  if (!key) return true
  const got = typeof req.headers['x-afr-internal-key'] === 'string' ? req.headers['x-afr-internal-key'] : ''
  if (!got) return false
  return safeEqual(got, key)
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
  const {token, baseId, table, filterByFormula, fields, maxRecords = 100, pageSize = 100} = args
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

async function airtablePatchRecords(args: {
  token: string
  baseId: string
  table: string
  records: Array<{id: string; fields: Record<string, unknown>}>
}): Promise<void> {
  const {token, baseId, table, records} = args

  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
    const resp = await airtableRequestWithRetry<unknown>(token, url, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({records: chunk}),
    })
    if (!resp.ok) throw new Error(`Airtable patch failed: ${resp.status} ${resp.body}`)
  }
}

function mergeTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '')
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

function isValidEmailLoose(s: string): boolean {
  const x = s.trim()
  if (x.length < 3 || x.length > 254) return false
  const at = x.indexOf('@')
  if (at <= 0 || at !== x.lastIndexOf('@')) return false
  const dot = x.lastIndexOf('.')
  return dot > at + 1 && dot < x.length - 1
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

type Payload = {
  to: string
  from: string
  replyTo: string
  subject: string
  text: string
  html: string
  personalisedSnapshot: string
  sendId: string
}

async function countQueuedForPitch(args: {
  token: string
  baseId: string
  sendsTable: string
  campaignPitch: string
}): Promise<number> {
  const {token, baseId, sendsTable, campaignPitch} = args
  let offset: string | undefined
  let count = 0

  const pitchEsc = escapeAirtableString(campaignPitch)
  const filter = `AND(FIND("${pitchEsc}", ARRAYJOIN({Pitch})), {Delivery status}="Queued")`

  while (true) {
    const params = new URLSearchParams()
    params.set('pageSize', '100')
    params.set('filterByFormula', filter)
    if (offset) params.set('offset', offset)

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sendsTable)}?${params.toString()}`
    const r = await fetch(url, {headers: {Authorization: `Bearer ${token}`}})
    const j = (await r.json().catch(() => null)) as unknown
    if (!r.ok) throw new Error(`Airtable count failed: ${r.status} ${JSON.stringify(j)}`)

    const records =
      isObj(j) && Array.isArray((j as {records?: unknown}).records)
        ? ((j as {records: unknown}).records as unknown[])
        : []

    count += records.length

    const next =
      isObj(j) && typeof (j as {offset?: unknown}).offset === 'string' ? (j as {offset: string}).offset : undefined

    if (!next) return count
    offset = next
  }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function computeNextPollMs(args: {sent: number; remainingQueued: number; batchLimit: number}): number {
  const {sent, remainingQueued, batchLimit} = args
  if (remainingQueued <= 0) return 0
  if (sent >= batchLimit) return 900
  return 1400
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const runId = crypto.randomUUID()

  try {
    if (!allowInternal(req)) return jsonError(res, 401, 'Unauthorized')
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const resendKey = must(process.env.AFR_RESEND_API_KEY, 'AFR_RESEND_API_KEY')
    const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')

    const contactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')
    const campaignsTable = must(process.env.AIRTABLE_CAMPAIGNS_TABLE, 'AIRTABLE_CAMPAIGNS_TABLE')
    const sendsTable = must(process.env.AIRTABLE_SENDS_TABLE, 'AIRTABLE_SENDS_TABLE')

    const body = (req.body ?? {}) as Record<string, unknown>
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : ''
    const limitRaw = typeof body.limit === 'number' ? body.limit : undefined
    const force = body.force === true

    if (!campaignId) return jsonError(res, 400, 'Missing campaignId')

    const batchLimit = Math.max(1, Math.min(100, typeof limitRaw === 'number' ? Math.floor(limitRaw) : 50))
    const resend = new Resend(resendKey)
    const nowIso = isoNow()

    // Fetch campaign by RECORD_ID (one record)
    const camp = await airtableList<CampaignFields>({
      token: airtableToken,
      baseId,
      table: campaignsTable,
      filterByFormula: `RECORD_ID()="${escapeAirtableString(campaignId)}"`,
      fields: [
        'Campaign/Pitch',
        'Email subject template',
        'Email body template',
        'Default CTA',
        'Key links',
        'Assets pack link',
        'Status',
        'Sent at',
      ],
      maxRecords: 1,
    })

    const campaignFields = camp?.[0]?.fields ?? {}
    const campaignPitch = asString(campaignFields['Campaign/Pitch']).trim()
    if (!campaignPitch) return jsonError(res, 400, 'Campaign missing Campaign/Pitch (primary field)')

    const status = asString(campaignFields.Status).trim()
    if (!force && status === 'Sending') {
      return res.status(409).json({
        error: 'Campaign already in Sending state (likely another drain running).',
        code: 'CAMPAIGN_LOCKED',
        runId,
        campaignId,
        campaignPitch,
      })
    }

    const subjectTemplate = asString(campaignFields['Email subject template']).trim()
    const bodyTemplate = asString(campaignFields['Email body template']).trim()
    if (!subjectTemplate || !bodyTemplate) return jsonError(res, 400, 'Campaign is missing subject/body templates')

    // Set to Sending as a coarse-grained lock (best-effort)
    try {
      await airtablePatchRecords({
        token: airtableToken,
        baseId,
        table: campaignsTable,
        records: [{id: campaignId, fields: {Status: 'Sending'}}],
      })
    } catch {}

    // Filter Sends via linked primary values (ARRAYJOIN({Pitch})) by campaignPitch
    const pitchEsc = escapeAirtableString(campaignPitch)
    const listFilter = `AND(FIND("${pitchEsc}", ARRAYJOIN({Pitch})), {Delivery status}="Queued")`

    const queued = await airtableList<SendFields>({
      token: airtableToken,
      baseId,
      table: sendsTable,
      filterByFormula: listFilter,
      fields: ['Recipient', 'From address', 'Reply-to', 'Notes', 'Resend message id', 'Delivery status', 'Contact', 'Pitch'],
      maxRecords: 100,
    })

    // Eligible: queued with no resend id, then cap to batchLimit
    const candidateSends = queued
      .filter((s) => asString(s.fields['Resend message id']).trim().length === 0)
      .slice(0, batchLimit)

    const diagSample = candidateSends.slice(0, 3).map((s) => ({
      id: s.id,
      recipient: asString(s.fields.Recipient),
      resendMessageId: asString(s.fields['Resend message id']),
      deliveryStatus: asString(s.fields['Delivery status']),
      notes: asString(s.fields.Notes).slice(0, 160),
    }))

    if (!candidateSends.length) {
      const remainingQueued = await countQueuedForPitch({token: airtableToken, baseId, sendsTable, campaignPitch})

      if (remainingQueued === 0) {
        try {
          await airtablePatchRecords({
            token: airtableToken,
            baseId,
            table: campaignsTable,
            records: [{id: campaignId, fields: {Status: 'Complete'}}],
          })
        } catch {}
      }

      const nextPollMs = clampInt(computeNextPollMs({sent: 0, remainingQueued, batchLimit}), 0, 5000)

      return res.status(200).json({
        ok: true,
        sent: 0,
        remainingQueued,
        nextPollMs,
        runId,
        diagnostics: {
          campaignId,
          campaignPitch,
          listFilter,
          queuedMatchedByPitch: queued.length,
          eligibleToSend: 0,
          sample: diagSample,
        },
      })
    }

    // Contacts for merges (via Send.Contact)
    const contactIds = Array.from(
      new Set(
        candidateSends
          .flatMap((s) => (Array.isArray(s.fields.Contact) ? s.fields.Contact : []))
          .filter((x) => typeof x === 'string' && x.startsWith('rec'))
      )
    )

    const contactById: Record<string, ContactFields> = {}
    if (contactIds.length) {
      const or = contactIds.map((id) => `RECORD_ID()="${escapeAirtableString(id)}"`).join(',')
      const contacts = await airtableList<ContactFields>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: `OR(${or})`,
        fields: ['Full name', 'First name', 'Last name', 'Email', 'One-line hook', 'Custom paragraph'],
        maxRecords: Math.min(100, contactIds.length),
      })
      for (const c of contacts) contactById[c.id] = c.fields
    }

    const invalid: Array<{sendId: string; reason: string}> = []
    const payloads: Payload[] = []

    for (const s of candidateSends) {
      const to = normalizeEmail(asString(s.fields.Recipient))
      const from = asString(s.fields['From address']).trim()
      const replyTo = asString(s.fields['Reply-to']).trim()

      if (!isValidEmailLoose(to)) {
        invalid.push({sendId: s.id, reason: `Invalid recipient email: "${to}"`})
        continue
      }
      if (!from) {
        invalid.push({sendId: s.id, reason: `Missing From address`})
        continue
      }
      if (replyTo && !isValidEmailLoose(replyTo)) {
        invalid.push({sendId: s.id, reason: `Invalid Reply-to: "${replyTo}"`})
        continue
      }

      const contactId = Array.isArray(s.fields.Contact) && s.fields.Contact.length ? s.fields.Contact[0] : undefined
      const cf = contactId ? contactById[contactId] : undefined

      const firstName = asString(cf?.['First name'])
      const lastName = asString(cf?.['Last name'])
      const fullName = asString(cf?.['Full name']) || [firstName, lastName].filter(Boolean).join(' ').trim()
      const oneLineHook = asString(cf?.['One-line hook'])
      const customParagraph = asString(cf?.['Custom paragraph'])

      const vars: Record<string, string> = {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email: to,
        outlet: '',
        one_line_hook: oneLineHook,
        custom_paragraph: customParagraph,
        campaign_name: campaignPitch,
        key_links: asString(campaignFields['Key links']),
        assets_pack_link: asString(campaignFields['Assets pack link']),
        default_cta: asString(campaignFields['Default CTA']),
      }

      const subj = mergeTemplate(subjectTemplate, vars).trim()
      const bodyText = mergeTemplate(bodyTemplate, vars).trim()

      const text = bodyText || ' '
      const recipientName = firstName || fullName || ''

      const html = await renderEmail(
      React.createElement(PressPitchEmail, {
        brandName: 'Angelfish Records',
        recipientName,
        campaignName: campaignPitch,
        bodyMarkdown: bodyText,
        defaultCta: asString(campaignFields['Default CTA']),
        keyLinks: asString(campaignFields['Key links']),
        assetsPackLink: asString(campaignFields['Assets pack link']),
      }),
      {pretty: true}
    )

      const personalisedSnapshot = [oneLineHook, customParagraph].filter(Boolean).join('\n\n').trim()

      payloads.push({
        to,
        from,
        replyTo,
        subject: subj || '(no subject)',
        text,
        html,
        personalisedSnapshot,
        sendId: s.id,
      })
    }

    // Mark invalid rows as Failed (best-effort), but keep the batch moving.
    if (invalid.length) {
      try {
        await airtablePatchRecords({
          token: airtableToken,
          baseId,
          table: sendsTable,
          records: invalid.map((x) => ({
            id: x.sendId,
            fields: {
              'Delivery status': 'Failed',
              'Last event at': nowIso,
              Notes: `validation_failed=${x.reason}\nrun_id=${runId}`.slice(0, 90000),
            },
          })),
        })
      } catch {}
    }

    if (!payloads.length) {
      const remainingQueued = await countQueuedForPitch({token: airtableToken, baseId, sendsTable, campaignPitch})
      const nextPollMs = clampInt(computeNextPollMs({sent: 0, remainingQueued, batchLimit}), 0, 5000)

      return res.status(200).json({
        ok: true,
        sent: 0,
        remainingQueued,
        nextPollMs,
        runId,
        diagnostics: {
          campaignId,
          campaignPitch,
          listFilter,
          queuedMatchedByPitch: queued.length,
          eligibleToSend: 0,
          invalidInBatch: invalid.length,
          sample: diagSample,
        },
      })
    }

    // Batch idempotency: stable for this exact set/order of send ids
    const batchKeyRaw = `campaign:${campaignId}:send_ids:${payloads.map((p) => p.sendId).join(',')}`
    const idempotencyKey = `af:${campaignId}:${sha256Hex(batchKeyRaw).slice(0, 48)}`

    // Stamp a note onto sends with run+idempotency (best-effort, helps audits + retries)
    try {
      await airtablePatchRecords({
        token: airtableToken,
        baseId,
        table: sendsTable,
        records: payloads.map((p) => {
          const orig = candidateSends.find((s) => s.id === p.sendId)
          return {
            id: p.sendId,
            fields: {
              Notes: `${asString(orig?.fields.Notes)}\n\ndrain_run_id=${runId}\nidempotency_key=${idempotencyKey}`
                .trim()
                .slice(0, 90000),
            },
          }
        }),
      })
    } catch {}

    let attempt = 0
    let lastError: unknown = null

    while (attempt < 3) {
      attempt++

      const emails = payloads.map((p) => ({
        from: p.from,
        to: p.to,
        subject: p.subject,
        text: p.text,
        html: p.html,
        ...(p.replyTo ? {replyTo: p.replyTo} : {}),
        tags: [
          {name: 'campaign_id', value: campaignId},
          {name: 'send_id', value: p.sendId},
          {name: 'run_id', value: runId},
        ],
      }))

      const result = await resend.batch.send(emails, {idempotencyKey})
      const error = (result as {error?: unknown}).error

      if (!error) {
        const dataUnknown = (result as {data?: unknown}).data

        const idsArr: Array<{id: string}> | null =
          Array.isArray(dataUnknown)
            ? (dataUnknown as Array<{id: string}>)
            : isObj(dataUnknown) && Array.isArray((dataUnknown as {data?: unknown}).data)
              ? ((dataUnknown as {data: unknown}).data as Array<{id: string}>)
              : null

        if (!idsArr || idsArr.length !== payloads.length) {
          throw new Error('Resend batch response missing ids (unexpected shape)')
        }

        await airtablePatchRecords({
          token: airtableToken,
          baseId,
          table: sendsTable,
          records: payloads.map((p, i) => ({
            id: p.sendId,
            fields: {
              'Resend message id': idsArr[i]?.id ?? '',
              'Delivery status': 'Sent',
              'Sent at': nowIso,
              'Last event at': nowIso,
              'Personalised paragraph used': p.personalisedSnapshot,
            },
          })),
        })

        // Set Campaigns.Sent at if it’s empty-ish (best-effort)
        if (!asString(campaignFields['Sent at']).trim()) {
          try {
            await airtablePatchRecords({
              token: airtableToken,
              baseId,
              table: campaignsTable,
              records: [{id: campaignId, fields: {'Sent at': nowIso}}],
            })
          } catch {}
        }

        const sentCount = payloads.length
        const remainingQueued = await countQueuedForPitch({token: airtableToken, baseId, sendsTable, campaignPitch})

        if (remainingQueued === 0) {
          try {
            await airtablePatchRecords({
              token: airtableToken,
              baseId,
              table: campaignsTable,
              records: [{id: campaignId, fields: {Status: 'Complete'}}],
            })
          } catch {}
        }

        const nextPollMs = clampInt(computeNextPollMs({sent: sentCount, remainingQueued, batchLimit}), 0, 5000)

        return res.status(200).json({
          ok: true,
          sent: sentCount,
          remainingQueued,
          nextPollMs,
          runId,
          diagnostics: {
            campaignId,
            campaignPitch,
            statusBefore: status,
            listFilter,
            queuedMatchedByPitch: queued.length,
            eligibleToSend: candidateSends.length,
            invalidInBatch: invalid.length,
            sentThisBatch: sentCount,
            sample: diagSample,
          },
        })
      }

      lastError = error
      const msg =
        typeof (error as {message?: unknown} | null)?.message === 'string'
          ? (error as {message: string}).message
          : stringifyError(error)

      const looksRateLimited = msg.includes('429') || msg.toLowerCase().includes('rate')
      if (!looksRateLimited) break

      await sleep(Math.min(8000, 500 * Math.pow(2, attempt - 1)))
    }

    const errText = stringifyError(lastError)

    await airtablePatchRecords({
      token: airtableToken,
      baseId,
      table: sendsTable,
      records: payloads.map((p) => ({
        id: p.sendId,
        fields: {
          'Delivery status': 'Failed',
          Notes: `${errText ? `send_failed=${errText}\n` : ''}run_id=${runId}`.slice(0, 90000),
          'Last event at': nowIso,
        },
      })),
    })

    return res.status(502).json({
      error: 'Drain send failed',
      resend: errText,
      runId,
      diagnostics: {
        campaignId,
        campaignPitch,
        listFilter,
        queuedMatchedByPitch: queued.length,
        eligibleToSend: candidateSends.length,
        invalidInBatch: invalid.length,
        sentThisBatch: 0,
        sample: diagSample,
      },
    })
  } catch (err) {
    console.error('[campaigns/drain] failed', {runId, err})
    return res.status(500).json({
      error: 'Drain failed',
      message: err instanceof Error ? err.message : String(err),
      runId,
    })
  }
}
