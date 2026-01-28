import type {NextApiRequest, NextApiResponse} from 'next'
import {Resend} from 'resend'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function airtableFetchJson(token: string, url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  const j = await r.json().catch(() => ({}))
  return {ok: r.ok, status: r.status, headers: r.headers, json: j}
}

function escapeAirtableString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

type AirtableRecord = {id: string; fields: Record<string, unknown>}

async function airtableList(args: {
  token: string
  baseId: string
  table: string
  filterByFormula: string
  maxRecords: number
  fields?: string[]
}) {
  const {token, baseId, table, filterByFormula, maxRecords, fields} = args

  const fieldParams =
    fields && fields.length
      ? fields.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&')
      : ''

  const url =
    `https://api.airtable.com/v0/${baseId}/${table}` +
    `?maxRecords=${maxRecords}&filterByFormula=${encodeURIComponent(filterByFormula)}` +
    (fieldParams ? `&${fieldParams}` : '')

  const r = await airtableFetchJson(token, url)
  if (!r.ok) throw new Error(`Airtable list failed: ${r.status} ${JSON.stringify(r.json)}`)
  const recs = Array.isArray(r.json.records) ? r.json.records : []
  return recs.map((x: any) => ({id: x.id, fields: (x.fields ?? {}) as Record<string, unknown>})) as AirtableRecord[]
}

async function airtablePatch(args: {
  token: string
  baseId: string
  table: string
  recordId: string
  fields: Record<string, unknown>
}) {
  const {token, baseId, table, recordId, fields} = args
  const url = `https://api.airtable.com/v0/${baseId}/${table}/${recordId}`
  const r = await airtableFetchJson(token, url, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({fields}),
  })
  if (!r.ok) throw new Error(`Airtable patch failed: ${r.status} ${JSON.stringify(r.json)}`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const adminKey = process.env.AFR_INTERNAL_ADMIN_KEY
    if (adminKey) {
      const got = req.headers['x-admin-key']
      if (got !== adminKey) return res.status(401).json({error: 'Unauthorized'})
    }

    const {campaignId, maxToProcess} = req.body ?? {}
    if (typeof campaignId !== 'string' || !campaignId.startsWith('rec')) {
      return res.status(400).json({error: 'campaignId must be an Airtable record id (rec...)'})
    }

    const maxN = typeof maxToProcess === 'number' && maxToProcess > 0 ? Math.min(50, Math.floor(maxToProcess)) : 25

    const token = must(process
