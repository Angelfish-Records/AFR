{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import 'server-only'\
import \{NextRequest, NextResponse\} from 'next/server'\
import \{Resend\} from 'resend'\
\
export const runtime = 'nodejs'\
\
const resend = new Resend(process.env.AFR_RESEND_API_KEY ?? 're_dummy')\
\
function must(v: string | undefined, name: string) \{\
  if (!v) throw new Error(`Missing $\{name\}`)\
  return v\
\}\
\
type SvixHeaders = \{id: string; timestamp: string; signature: string\}\
\
type ResendWebhookEnvelope = \{\
  type?: string\
  created_at?: string\
  data?: unknown\
\}\
\
type ResendEmailEventData = \{\
  email_id?: string\
  from?: string\
  to?: string[]\
  subject?: string\
\}\
\
function isObj(x: unknown): x is Record<string, unknown> \{\
  return !!x && typeof x === 'object'\
\}\
\
function looksLikeEmailEventData(x: unknown): x is ResendEmailEventData \{\
  if (!isObj(x)) return false\
  if ('to' in x && x.to !== undefined && !Array.isArray(x.to)) return false\
  return true\
\}\
\
function lowerEmail(s: string): string \{\
  return s.trim().toLowerCase()\
\}\
\
async function airtableUpsertByUniqueField(args: \{\
  baseId: string\
  table: string\
  token: string\
  uniqueField: string\
  uniqueValue: string\
  fields: Record<string, unknown>\
\}) \{\
  const \{baseId, table, token, uniqueField, uniqueValue, fields\} = args\
\
  // 1) Find existing record by unique field\
  const filter = encodeURIComponent(`\{$\{uniqueField\}\} = "$\{uniqueValue.replace(/"/g, '\\\\"')\}"`)\
  const searchUrl = `https://api.airtable.com/v0/$\{baseId\}/$\{encodeURIComponent(table)\}?maxRecords=1&filterByFormula=$\{filter\}`\
  const searchRes = await fetch(searchUrl, \{\
    headers: \{Authorization: `Bearer $\{token\}`\},\
  \})\
  if (!searchRes.ok) throw new Error(`Airtable search failed: $\{searchRes.status\}`)\
  const searchJson = (await searchRes.json()) as \{records?: Array<\{id: string\}>\}\
  const existingId = searchJson.records?.[0]?.id\
\
  // 2) Create or update\
  const url = existingId\
    ? `https://api.airtable.com/v0/$\{baseId\}/$\{encodeURIComponent(table)\}/$\{existingId\}`\
    : `https://api.airtable.com/v0/$\{baseId\}/$\{encodeURIComponent(table)\}`\
  const method = existingId ? 'PATCH' : 'POST'\
  const body = existingId ? \{fields\} : \{records: [\{fields\}]\}\
\
  const writeRes = await fetch(url, \{\
    method,\
    headers: \{\
      Authorization: `Bearer $\{token\}`,\
      'Content-Type': 'application/json',\
    \},\
    body: JSON.stringify(body),\
  \})\
  if (!writeRes.ok) throw new Error(`Airtable write failed: $\{writeRes.status\}`)\
\}\
\
export async function POST(req: NextRequest) \{\
  const webhookSecret = must(process.env.AFR_RESEND_WEBHOOK_SECRET, 'AFR_RESEND_WEBHOOK_SECRET')\
  const airtableToken = must(process.env.AIRTABLE_TOKEN, 'AIRTABLE_TOKEN')\
  const baseId = must(process.env.AIRTABLE_BASE_ID, 'AIRTABLE_BASE_ID')\
  const eventsTable = must(process.env.AIRTABLE_EVENTS_TABLE, 'AIRTABLE_EVENTS_TABLE')\
  const suppressionsTable = must(process.env.AIRTABLE_SUPPRESSIONS_TABLE, 'AIRTABLE_SUPPRESSIONS_TABLE')\
\
  const payload = await req.text()\
\
  const svixId = req.headers.get('svix-id') ?? ''\
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''\
  const svixSignature = req.headers.get('svix-signature') ?? ''\
  if (!svixId || !svixTimestamp || !svixSignature) \{\
    return new NextResponse('Missing webhook headers', \{status: 400\})\
  \}\
\
  const headers: SvixHeaders = \{id: svixId, timestamp: svixTimestamp, signature: svixSignature\}\
\
  let event: ResendWebhookEnvelope\
  try \{\
    const verified = resend.webhooks.verify(\{payload, headers, webhookSecret\})\
    event = verified as unknown as ResendWebhookEnvelope\
  \} catch \{\
    return new NextResponse('Invalid webhook', \{status: 400\})\
  \}\
\
  try \{\
    const type = typeof event.type === 'string' ? event.type : ''\
    const createdAtIso = event.created_at ? new Date(event.created_at).toISOString() : new Date().toISOString()\
    const receivedAtIso = new Date().toISOString()\
\
    const data = event.data\
    const isEmailData = looksLikeEmailEventData(data)\
\
    const emailId = isEmailData && typeof data.email_id === 'string' ? data.email_id : ''\
    const from = isEmailData && typeof data.from === 'string' ? data.from : ''\
    const to0 =\
      isEmailData && Array.isArray(data.to) && typeof data.to[0] === 'string'\
        ? lowerEmail(data.to[0])\
        : ''\
    const subject = isEmailData && typeof data.subject === 'string' ? data.subject : ''\
\
    // 1) Event log (idempotent by svix_id)\
    await airtableUpsertByUniqueField(\{\
      baseId,\
      table: eventsTable,\
      token: airtableToken,\
      uniqueField: 'svix_id',\
      uniqueValue: svixId,\
      fields: \{\
        svix_id: svixId,\
        event_type: type,\
        created_at: createdAtIso,\
        email_id: emailId || undefined,\
        to: to0 || undefined,\
        from: from || undefined,\
        subject: subject || undefined,\
        raw: payload,\
        received_at: receivedAtIso,\
      \},\
    \})\
\
    // 2) Suppressions for bounce/complaint\
    if (to0 && (type === 'email.bounced' || type === 'email.complained')) \{\
      // first_seen_at should only be set on create; this upsert sets it always,\
      // but Airtable will simply overwrite. If you care, we can two-step it.\
      await airtableUpsertByUniqueField(\{\
        baseId,\
        table: suppressionsTable,\
        token: airtableToken,\
        uniqueField: 'email',\
        uniqueValue: to0,\
        fields: \{\
          email: to0,\
          reason: type,\
          source: 'resend',\
          first_seen_at: receivedAtIso,\
          last_seen_at: receivedAtIso,\
        \},\
      \})\
    \}\
  \} catch (e) \{\
    return new NextResponse('Webhook processing failed', \{status: 500\})\
  \}\
\
  return NextResponse.json(\{ok: true\})\
\}\
}