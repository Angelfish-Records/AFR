import type {NextApiRequest, NextApiResponse} from 'next'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function escapeAirtableString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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
  return {ok: r.ok, status: r.status, json: j}
}

async function airtableListAll(args: {
  token: string
  baseId: string
  table: string
  filterByFormula: string
  fields?: string[]
}) {
  const {token, baseId, table, filterByFormula, fields} = args
  let offset: string | undefined = undefined
  const records: Array<{id: string; fields: Record<string, unknown>}> = []

  while (true) {
    const fieldParams =
      fields && fields.length
        ? fields.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&')
        : ''

    const url =
      `https://api.airtable.com/v0/${baseId}/${table}` +
      `?pageSize=100&filterByFormula=${encodeURIComponent(filterByFormula)}` +
      (fieldParams ? `&${fieldParams}` : '') +
      (offset ? `&offset=${encodeURIComponent(offset)}` : '')

    const r = await airtableFetchJson(token, url)
    if (!r.ok) throw new Error(`Airtable list failed: ${r.status} ${JSON.stringify(r.json)}`)

    const recs = Array.isArray(r.json.records) ? r.json.records : []
    for (const x of recs) records.push({id: x.id, fields: x.fields ?? {}})

    if (!r.json.offset) break
    offset = r.json.offset
  }

  return records
}

async function airtableFindByUniqueField(args: {
  token: string
  baseId: string
  table: string
  fieldName: string
  value: string
}) {
  const {token, baseId, table, fieldName, value} = args
  const filter = encodeURIComponent(`{${fieldName}} = "${escapeAirtableString(value)}"`)
  const url = `https://api.airtable.com/v0/${baseId}/${table}?maxRecords=1&filterByFormula=${filter}`
  const r = await airtableFetchJson(token, url)
  if (!r.ok) throw new Error(`Airtable search failed: ${r.status} ${JSON.stringify(r.json)}`)
  const rec = r.json.records?.[0]
  return rec ? {id: rec.id as string, fields: (rec.fields ?? {}) as Record<string, unknown>} : null
}

async function airtableCreateRecords(args: {
  token: string
  baseId: string
  table: string
  records: Array<{fields: Record<string, unknown>}>
}) {
  const {token, baseId, table, records} = args
  const url = `https://api.airtable.com/v0/${baseId}/${table}`
  const r = await airtableFetchJson(token, url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({records}),
  })
  if (!r.ok) throw new Error(`Airtable create failed: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    // Simple internal guard (recommended). Remove if you truly want it public.
    const adminKey = process.env.AFR_INTERNAL_ADMIN_KEY
    if (adminKey) {
      const got = req.headers['x-admin-key']
      if (got !== adminKey) return res.status(401).json({error: 'Unauthorized'})
    }

    const {audienceKey, subject, body, campaignKey} = req.body ?? {}
    if (audienceKey !== 'press_mailable_v1') return res.status(400).json({error: 'Unknown audienceKey'})
    if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({error: 'Missing subject'})
    if (typeof body !== 'string' || !body.trim()) return res.status(400).json({error: 'Missing body'})
    if (typeof campaignKey !== 'string' || !campaignKey.trim()) return res.status(400).json({error: 'Missing campaignKey'})

    const token = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')
    const contactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')
    const campaignsTable = must(process.env.AIRTABLE_CAMPAIGNS_TABLE, 'AIRTABLE_CAMPAIGNS_TABLE')
    const sendsTable = must(process.env.AIRTABLE_SENDS_TABLE, 'AIRTABLE_SENDS_TABLE')

    // Idempotency: if this campaign_key exists, return it.
    const existing = await airtableFindByUniqueField({
      token,
      baseId,
      table: campaignsTable,
      fieldName: 'campaign_key',
      value: campaignKey,
    })
    if (existing) {
      return res.status(200).json({campaignId: existing.id, queuedCount: null})
    }

    // Create campaign row (intent recorded before any sends)
    const createdCampaign = await airtableCreateRecords({
      token,
      baseId,
      table: campaignsTable,
      records: [
        {
          fields: {
            campaign_key: campaignKey,
            audience_key: audienceKey,
            status: 'Queued',
            email_subject_template: subject,
            email_body_template: body,
            enqueued_at: new Date().toISOString(),
          },
        },
      ],
    })

    const campaignId = createdCampaign.records?.[0]?.id as string
    if (!campaignId) throw new Error('Campaign create returned no id')

    // List eligible contacts (Airtable is the eligibility authority)
    const contacts = await airtableListAll({
      token,
      baseId,
      table: contactsTable,
      filterByFormula: '{Is mailable} = 1',
      fields: ['Email', 'First name', 'Last name', 'Outlet'],
    })

    // Create Sends rows in chunks
    let queued = 0
    const batch: Array<{fields: Record<string, unknown>}> = []

    for (const c of contacts) {
      const email = typeof c.fields['Email'] === 'string' ? (c.fields['Email'] as string).trim().toLowerCase() : ''
      if (!email) continue

      const sendKey = `${campaignId}:${email}`

      batch.push({
        fields: {
          send_key: sendKey,
          campaign: [campaignId],          // link field (recommended schema tweak)
          contact: [c.id],                 // link field (recommended schema tweak)
          recipient: email,                // keep string too (handy + stable)
          delivery_status: 'Queued',
          attempt_count: 0,
          last_error: '',
          queued_at: new Date().toISOString(),
        },
      })

      if (batch.length >= 10) {
        await airtableCreateRecords({token, baseId, table: sendsTable, records: batch.splice(0, batch.length)})
      }
      queued++
    }

    if (batch.length) {
      await airtableCreateRecords({token, baseId, table: sendsTable, records: batch})
    }

    // Update campaign with queued_count
    await airtableFetchJson(token, `https://api.airtable.com/v0/${baseId}/${campaignsTable}/${campaignId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fields: {queued_count: queued}}),
    })

    return res.status(200).json({campaignId, queuedCount: queued})
  } catch (err) {
    return res.status(500).json({error: err instanceof Error ? err.message : String(err)})
  }
}
