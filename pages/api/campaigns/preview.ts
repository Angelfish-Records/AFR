import type {NextApiRequest, NextApiResponse} from 'next'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

function getTextField(fields: Record<string, unknown>, key: string): string {
  const v = fields[key]
  return typeof v === 'string' ? v : ''
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const {audienceKey, subject, body, sampleContactId} = req.body ?? {}
    if (audienceKey !== 'press_mailable_v1') return res.status(400).json({error: 'Unknown audienceKey'})
    if (typeof subject !== 'string' || typeof body !== 'string') return res.status(400).json({error: 'Missing subject/body'})
    if (typeof sampleContactId !== 'string' || !sampleContactId.startsWith('rec')) {
      return res.status(400).json({error: 'sampleContactId must be an Airtable record id (rec...)'})
    }

    const token = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
    const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')
    const contactsTable = must(process.env.AIRTABLE_PRESS_CONTACTS_TABLE, 'AIRTABLE_PRESS_CONTACTS_TABLE')

    const r = await fetch(`https://api.airtable.com/v0/${baseId}/${contactsTable}/${sampleContactId}`, {
      headers: {Authorization: `Bearer ${token}`},
    })
    const j = await r.json()
    if (!r.ok) return res.status(500).json({error: `Airtable read failed: ${r.status} ${JSON.stringify(j)}`})

    const fields = (j.fields ?? {}) as Record<string, unknown>
    const email = getTextField(fields, 'Email')
    const firstName = getTextField(fields, 'First name')
    const lastName = getTextField(fields, 'Last name')
    const outlet = getTextField(fields, 'Outlet') // if you have it; blank is fine

    const vars: Record<string, string> = {
      email,
      first_name: firstName,
      last_name: lastName,
      outlet,
    }

    return res.status(200).json({
      subject: renderTemplate(subject, vars),
      text: renderTemplate(body, vars),
      sample: {email, first_name: firstName, last_name: lastName, outlet},
    })
  } catch (err) {
    return res.status(500).json({error: err instanceof Error ? err.message : String(err)})
  }
}
