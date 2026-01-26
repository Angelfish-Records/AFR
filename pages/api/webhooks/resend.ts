import type {NextApiRequest, NextApiResponse} from 'next'
import {Resend} from 'resend'

const resend = new Resend(process.env.AFR_RESEND_API_KEY ?? 're_dummy')

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

// IMPORTANT: disable body parsing so we can read the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
}

type SvixHeaders = {id: string; timestamp: string; signature: string}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  const webhookSecret = must(process.env.AFR_RESEND_WEBHOOK_SECRET, 'AFR_RESEND_WEBHOOK_SECRET')

  const svixId = (req.headers['svix-id'] as string | undefined) ?? ''
  const svixTimestamp = (req.headers['svix-timestamp'] as string | undefined) ?? ''
  const svixSignature = (req.headers['svix-signature'] as string | undefined) ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).send('Missing webhook headers')
  }

  const payload = await readRawBody(req)

  const headers: SvixHeaders = {id: svixId, timestamp: svixTimestamp, signature: svixSignature}

  let event: unknown
  try {
    event = resend.webhooks.verify({payload, headers, webhookSecret})
  } catch {
    return res.status(400).send('Invalid webhook')
  }

  // TODO: your Airtable writes go here (same logic as before)
  // For now, just acknowledge.
  return res.status(200).json({ok: true})
}
