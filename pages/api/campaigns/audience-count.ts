{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import type \{NextApiRequest, NextApiResponse\} from 'next'\
\
export default async function handler(req: NextApiRequest, res: NextApiResponse) \{\
  const \{audienceKey\} = req.query\
  if (audienceKey !== 'press_mailable_v1') \{\
    return res.status(400).json(\{error: 'Unknown audience'\})\
  \}\
\
  const token = process.env.AIRTABLE_TOKEN!\
  const baseId = process.env.AIRTABLE_BASE_ID!\
  const contactsTable = process.env.AIRTABLE_PRESS_CONTACTS_TABLE!\
\
  const filter = encodeURIComponent('\{Is mailable\} = 1')\
  const url = `https://api.airtable.com/v0/$\{baseId\}/$\{contactsTable\}?filterByFormula=$\{filter\}&pageSize=1`\
\
  const r = await fetch(url, \{\
    headers: \{Authorization: `Bearer $\{token\}`\},\
  \})\
\
  const data = await r.json()\
  res.json(\{count: data.records?.length ?? 0\})\
\}\
}