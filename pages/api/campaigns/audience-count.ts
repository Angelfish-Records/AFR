import type {NextApiRequest, NextApiResponse} from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {audienceKey} = req.query
  if (audienceKey !== 'press_mailable_v1') {
    return res.status(400).json({error: 'Unknown audience'})
  }

  const token = process.env.AIRTABLE_TOKEN!
  const baseId = process.env.AIRTABLE_BASE_ID!
  const contactsTable = process.env.AIRTABLE_PRESS_CONTACTS_TABLE!

  const filter = encodeURIComponent('{Is mailable} = 1')
  const url = `https://api.airtable.com/v0/${baseId}/${contactsTable}?filterByFormula=${filter}&pageSize=1`

  const r = await fetch(url, {
    headers: {Authorization: `Bearer ${token}`},
  })

  const data = await r.json()
  res.json({count: data.records?.length ?? 0})
}
