import \{useState\} from 'react'\
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
