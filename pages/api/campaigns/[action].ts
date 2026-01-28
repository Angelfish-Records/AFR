import type {NextApiRequest, NextApiResponse} from 'next'
import {Resend} from 'resend'

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {action} = req.query

  const token = process.env.AIRTABLE_TOKEN!
  const baseId = process.env.AIRTABLE_BASE_ID!
  const contactsTable = process.env.AIRTABLE_PRESS_CONTACTS_TABLE!
  const campaignsTable = process.env.AIRTABLE_CAMPAIGNS_TABLE!
  const sendsTable = process.env.AIRTABLE_SENDS_TABLE!

  if (action === 'preview') {
    const {subject, body, sampleContactId} = req.body

    const r = await fetch(
      `https://api.airtable.com/v0/${baseId}/${contactsTable}/${sampleContactId}`,
      {headers: {Authorization: `Bearer ${token}`}}
    )
    const rec = await r.json()
    const fields = rec.fields

    const vars = {
      first_name: fields['First name'] ?? '',
      last_name: fields['Last name'] ?? '',
      email: fields['Email'] ?? '',
    }

    res.json({
      subject: renderTemplate(subject, vars),
      text: renderTemplate(body, vars),
    })
    return
  }

  if (action === 'send') {
    const {subject, body} = req.body
    const resend = new Resend(process.env.AFR_RESEND_API_KEY!)

    // 1) create Campaign
    const campaignRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${campaignsTable}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                'Campaign/Pitch': subject,
                Status: 'Sending',
                'Email subject template': subject,
                'Email body template': body,
              },
            },
          ],
        }),
      }
    )
    const campaign = (await campaignRes.json()).records[0]

    // 2) fetch recipients
    const listRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${contactsTable}?filterByFormula={Is mailable}=1`,
      {headers: {Authorization: `Bearer ${token}`}}
    )
    const list = await listRes.json()

    // 3) send + create Sends
    for (const rec of list.records) {
      const email = rec.fields['Email']
      if (!email) continue

      const vars = {
        first_name: rec.fields['First name'] ?? '',
      }

      const renderedSubject = renderTemplate(subject, vars)
      const renderedBody = renderTemplate(body, vars)

      const send = await resend.emails.send({
        from: 'Brendan at Angelfish Records <brendan@press.angelfishrecords.com>',
        to: email,
        subject: renderedSubject,
        text: renderedBody,
      })

      await fetch(`https://api.airtable.com/v0/${baseId}/${sendsTable}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                Pitch: [campaign.id],
                Recipient: email,
                'Resend message id': send.data?.id,
                'Delivery status': 'Queued',
              },
            },
          ],
        }),
      })
    }

    res.json({campaignId: campaign.id})
    return
  }

  res.status(404).end()
}
