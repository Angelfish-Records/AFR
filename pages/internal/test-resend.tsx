{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import \{useState\} from 'react'\
\
export default function TestResend() \{\
  const [to, setTo] = useState('')\
  const [log, setLog] = useState('')\
\
  async function send() \{\
    setLog('Sending\'85')\
    const res = await fetch('/api/internal/send-test-email', \{\
      method: 'POST',\
      headers: \{'Content-Type': 'application/json'\},\
      body: JSON.stringify(\{\
        to,\
        subject: 'Resend pipeline test',\
        text: 'This is a test of the Resend \uc0\u8594  Airtable pipeline.',\
      \}),\
    \})\
    const json = await res.json()\
    setLog(JSON.stringify(json, null, 2))\
  \}\
\
  return (\
    <div style=\{\{padding: 24\}\}>\
      <h1>Resend pipeline test</h1>\
      <input\
        placeholder="email@example.com"\
        value=\{to\}\
        onChange=\{(e) => setTo(e.target.value)\}\
      />\
      <button onClick=\{send\}>Send</button>\
      <pre>\{log\}</pre>\
    </div>\
  )\
\}\
}