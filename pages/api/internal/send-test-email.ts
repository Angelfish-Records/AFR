// pages/api/internal/send-test-email.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import {Resend} from 'resend'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const resendApiKey = must(process.env.AFR_RESEND_API_KEY, 'AFR_RESEND_API_KEY')
  const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')
  const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')
  const sendsTable = must(process.env.AIRTABLE_SENDS_TABLE, 'AIRTABLE_SENDS_TABLE')

  const {to, subject, text} = req.body ?? {}
  if (!to || !subject || !text) {
    return res.status(400).json({error: 'Missing to / subject / text'})
  }

  const resend = new Resend(resendApiKey)

  const sendResult = await resend.emails.send({
    from: 'Angelfish Records <press@send.press.angelfishrecords.com>',
    to,
    subject,
    text,
  })

  if (!sendResult.data?.id) {
    return res.status(500).json({error: 'Resend send failed'})
  }

  const resendMessageId = sendResult.data.id

  // Create canonical Send row
  await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sendsTable)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${airtableToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [
        {
          fields: {
            'Resend message id': resendMessageId,
            'To email': to.toLowerCase(),
            'Subject': subject,
            'Delivery status': 'Queued',
            'Created at': new Date().toISOString(),
            'Source': 'manual-test',
          },
        },
      ],
    }),
  })

  return res.status(200).json({ok: true, resendMessageId})
}
