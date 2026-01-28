// pages/api/campaigns/preview.ts
import type {NextApiRequest, NextApiResponse} from 'next'
import crypto from 'crypto'
import * as React from 'react'
import {render as renderEmail} from '@react-email/render'
import PressPitchEmail from '../../../emails/PressPitchEmail'

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

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

type PreviewRequest = {
  brandName?: string
  recipientName?: string
  campaignName?: string
  subject?: string
  bodyText?: string // merged body
  defaultCta?: string
  keyLinks?: string
  assetsPackLink?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!allowInternal(req)) return res.status(401).json({error: 'Unauthorized'})
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const body = (req.body ?? {}) as PreviewRequest

    const brandName = asString(body.brandName).trim() || 'Angelfish Records'
    const recipientName = asString(body.recipientName).trim()
    const campaignName = asString(body.campaignName).trim()
    const subject = asString(body.subject).trim()
    const bodyText = asString(body.bodyText) // allow newlines

    // Render the exact same component drain.ts uses
    const element = React.createElement(PressPitchEmail, {
      brandName,
      bodyMarkdown: bodyText,
    })

    // In some versions/types this can be Promise<string>, so await is safest.
    const html = await renderEmail(element, {pretty: true})

    return res.status(200).json({
      ok: true,
      subject,
      html,
      // helpful for debugging / parity
      meta: {
        brandName,
        recipientName,
        campaignName,
      },
    })
  } catch (err) {
    return res.status(500).json({
      error: 'Preview render failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
