import type {NextApiRequest, NextApiResponse} from 'next'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function airtableGetAllCount(args: {
  token: string
  baseId: string
  table: string
  filterByFormula: string
}) {
  const {token, baseId, table, filterByFormula} = args
  let offset: string | undefined = undefined
  let count = 0

  // We only need counts; paginate with small pages.
  while (true) {
    const url =
      `https://api.airtable.com/v0/${baseId}/${table}` +
      `?pageSize=100&filterByFormula=${encodeURIComponent(filterByFormula)}` +
      (offset ? `&offset=${encodeURIComponent(offset)}` : '')

    const r = await fetch(url, {
      headers: {Authorization: `Bearer ${token}`},
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`Airtable list failed: ${r.status} ${JSON.stringify(j)}`)

    count += Array.isArray(j.records) ? j.records.length : 0
    if (!j.offset) break
    offset = j.offset
  }

  return count
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const audienceKey = String(req.query.audienceKey ?? '')
    if (audienceKey !== 'press_mailable_v1') {
      return res.status(400).json({error: 'Unknown audienceKey'})
    }

    const token = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')
    const contactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')

    const count = await airtableGetAllCount({
      token,
      baseId,
      table: contactsTable,
      filterByFormula: '{Is mailable} = 1',
    })

    return res.status(200).json({count})
  } catch (err) {
    return res.status(500).json({error: err instanceof Error ? err.message : String(err)})
  }
}
