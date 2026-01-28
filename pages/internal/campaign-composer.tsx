import {useEffect, useState} from 'react'

type AudienceKey = 'press_mailable_v1'

type PreviewResult = {
  subject: string
  text: string
}

export default function CampaignComposerPage() {
  const [audienceKey] = useState<AudienceKey>('press_mailable_v1')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [sampleContactId, setSampleContactId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const [loadingAudience, setLoadingAudience] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Load audience count
  useEffect(() => {
    async function loadCount() {
      setLoadingAudience(true)
      try {
        const res = await fetch(`/api/campaigns/audience-count?audienceKey=${audienceKey}`)
        const json = await res.json()
        setRecipientCount(json.count)
      } catch {
        setError('Failed to load audience')
      } finally {
        setLoadingAudience(false)
      }
    }
    loadCount()
  }, [audienceKey])

  async function requestPreview() {
    if (!sampleContactId) return
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          audienceKey,
          subject,
          body,
          sampleContactId,
        }),
      })
      const json = await res.json()
      setPreview(json)
    } catch {
      setError('Preview failed')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function sendCampaign() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns/send', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({audienceKey, subject, body}),
      })
      const json = await res.json()
      alert(`Campaign queued: ${json.campaignId}`)
    } catch {
      setError('Send failed')
    } finally {
      setSending(false)
    }
  }

  const canSend =
    subject.trim() &&
    body.trim() &&
    recipientCount !== null &&
    recipientCount > 0 &&
    !sending

  return (
    <div style={{maxWidth: 760, margin: '40px auto', padding: 24}}>
      <h1>Campaign Composer</h1>

      {/* Audience */}
      <section>
        <h2>Audience</h2>
        <p>
          Source: <strong>Press contacts (mailable)</strong>
        </p>
        <p>
          {loadingAudience
            ? 'Loading…'
            : recipientCount !== null
            ? `${recipientCount} recipients`
            : '—'}
        </p>
      </section>

      {/* Message */}
      <section>
        <h2>Message</h2>
        <input
          style={{width: '100%', marginBottom: 8}}
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          style={{width: '100%', minHeight: 180}}
          placeholder="Email body (supports {{first_name}}, {{outlet}} etc.)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </section>

      {/* Preview */}
      <section>
        <h2>Preview</h2>
        <input
          placeholder="Sample contact record ID"
          value={sampleContactId ?? ''}
          onChange={(e) => setSampleContactId(e.target.value || null)}
        />
        <button onClick={requestPreview} disabled={!sampleContactId || loadingPreview}>
          Preview
        </button>

        {preview && (
          <div style={{border: '1px solid #ccc', padding: 12, marginTop: 12}}>
            <strong>{preview.subject}</strong>
            <pre style={{whiteSpace: 'pre-wrap'}}>{preview.text}</pre>
          </div>
        )}
      </section>

      {/* Commit */}
      <section>
        <h2>Send</h2>
        <button onClick={sendCampaign} disabled={!canSend}>
          {sending ? 'Sending…' : 'Send campaign'}
        </button>
      </section>

      {error && <p style={{color: 'red'}}>{error}</p>}
    </div>
  )
}
