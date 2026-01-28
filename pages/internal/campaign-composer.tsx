import React, {useEffect, useMemo, useState} from 'react'

type AudienceKey = 'press_mailable_v1'

type PreviewResult = {
  subject: string
  text: string
  sample: {
    email: string
    first_name?: string
    last_name?: string
    outlet?: string
  }
}

type EnqueueResult = {
  campaignId: string
  queuedCount: number
}

type ProcessResult = {
  campaignId: string
  processed: number
  sentNow: number
  skippedAlreadySent: number
  failedNow: number
  remainingQueuedEstimate: number | null
}

export default function CampaignComposerPage() {
  const audienceKey: AudienceKey = 'press_mailable_v1'

  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [loadingAudience, setLoadingAudience] = useState(false)

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [sampleContactId, setSampleContactId] = useState<string>('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [enqueueing, setEnqueueing] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [lastProcess, setLastProcess] = useState<ProcessResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  const canPreview = useMemo(() => {
    return subject.trim().length > 0 && body.trim().length > 0 && sampleContactId.trim().length > 0
  }, [subject, body, sampleContactId])

  const canEnqueue = useMemo(() => {
    return subject.trim().length > 0 && body.trim().length > 0 && (recipientCount ?? 0) > 0 && !enqueueing
  }, [subject, body, recipientCount, enqueueing])

  const canProcess = useMemo(() => {
    return !!campaignId && !processing
  }, [campaignId, processing])

  // Load audience count
  useEffect(() => {
    async function load() {
      setLoadingAudience(true)
      setError(null)
      try {
        const r = await fetch(`/api/campaigns/audience-count?audienceKey=${audienceKey}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? 'Failed to load audience')
        setRecipientCount(j.count)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingAudience(false)
      }
    }
    load()
  }, [audienceKey])

  async function doPreview() {
    if (!canPreview) return
    setLoadingPreview(true)
    setError(null)
    try {
      const r = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({audienceKey, subject, body, sampleContactId}),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Preview failed')
      setPreview(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingPreview(false)
    }
  }

  async function doEnqueue() {
    if (!canEnqueue) return
    setEnqueueing(true)
    setError(null)
    setLastProcess(null)

    // Deterministic client key to make enqueue idempotent if user double-clicks.
    const campaignKey =
      'cmp_' +
      Math.random().toString(36).slice(2) +
      '_' +
      Date.now().toString(36)

    try {
      const r = await fetch('/api/campaigns/enqueue', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({audienceKey, subject, body, campaignKey}),
      })
      const j: EnqueueResult & {error?: string} = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Enqueue failed')
      setCampaignId(j.campaignId)
      alert(`Queued ${j.queuedCount} sends.\nCampaign: ${j.campaignId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnqueueing(false)
    }
  }

  async function doProcessOnce() {
    if (!campaignId) return
    setProcessing(true)
    setError(null)
    try {
      const r = await fetch('/api/campaigns/process', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({campaignId, maxToProcess: 25}),
      })
      const j: ProcessResult & {error?: string} = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Process failed')
      setLastProcess(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{maxWidth: 860, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif'}}>
      <h1 style={{marginBottom: 6}}>Campaign Composer</h1>
      <div style={{opacity: 0.7, marginBottom: 22}}>
        Audience → Message → Preview → Enqueue → Drain
      </div>

      <section style={{border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16}}>
        <h2 style={{marginTop: 0}}>Audience</h2>
        <div><strong>Press contacts</strong> where <code>{`{Is mailable} = 1`}</code></div>
        <div style={{marginTop: 8}}>
          {loadingAudience ? 'Loading…' : recipientCount !== null ? `${recipientCount} mailable recipients` : '—'}
        </div>
      </section>

      <section style={{border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16}}>
        <h2 style={{marginTop: 0}}>Message</h2>

        <label style={{display: 'block', marginBottom: 6}}>Subject</label>
        <input
          style={{width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ccc', marginBottom: 12}}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (supports {{first_name}}, {{outlet}} etc.)"
          maxLength={140}
        />

        <label style={{display: 'block', marginBottom: 6}}>Body</label>
        <textarea
          style={{width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ccc', minHeight: 220}}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Plain text body (recommended first). Merge vars like {{first_name}}, {{outlet}}"
        />

        <div style={{marginTop: 10, opacity: 0.75}}>
          Merge vars: <code>{'{{first_name}}'}</code> <code>{'{{last_name}}'}</code> <code>{'{{outlet}}'}</code> <code>{'{{email}}'}</code>
        </div>
      </section>

      <section style={{border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16}}>
        <h2 style={{marginTop: 0}}>Preview</h2>
        <div style={{display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10}}>
          <input
            style={{flex: 1, padding: 10, borderRadius: 10, border: '1px solid #ccc'}}
            value={sampleContactId}
            onChange={(e) => setSampleContactId(e.target.value)}
            placeholder="Paste a Press Contacts record id (rec...) for sample rendering"
          />
          <button
            onClick={doPreview}
            disabled={!canPreview || loadingPreview}
            style={{padding: '10px 14px', borderRadius: 10}}
          >
            {loadingPreview ? 'Rendering…' : 'Render'}
          </button>
        </div>

        {preview && (
          <div style={{border: '1px solid #eee', borderRadius: 10, padding: 12}}>
            <div style={{fontWeight: 700, marginBottom: 8}}>{preview.subject}</div>
            <pre style={{whiteSpace: 'pre-wrap', margin: 0}}>{preview.text}</pre>
            <div style={{marginTop: 10, opacity: 0.7, fontSize: 13}}>
              Sample: {preview.sample.email}{preview.sample.outlet ? ` • ${preview.sample.outlet}` : ''}
            </div>
          </div>
        )}
      </section>

      <section style={{border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16}}>
        <h2 style={{marginTop: 0}}>Enqueue</h2>
        <div style={{opacity: 0.75, marginBottom: 10}}>
          This creates the Campaign row and one queued Send row per eligible contact. No emails are sent yet.
        </div>
        <button
          onClick={doEnqueue}
          disabled={!canEnqueue}
          style={{padding: '10px 14px', borderRadius: 10}}
        >
          {enqueueing ? 'Queuing…' : 'Queue campaign'}
        </button>
        {campaignId && (
          <div style={{marginTop: 10}}>
            Campaign ID: <code>{campaignId}</code>
          </div>
        )}
      </section>

      <section style={{border: '1px solid #ddd', borderRadius: 12, padding: 16}}>
        <h2 style={{marginTop: 0}}>Drain</h2>
        <div style={{opacity: 0.75, marginBottom: 10}}>
          Processes queued sends in small batches, throttled to avoid Resend 429s and serverless timeouts.
        </div>
        <button
          onClick={doProcessOnce}
          disabled={!canProcess}
          style={{padding: '10px 14px', borderRadius: 10}}
        >
          {processing ? 'Processing…' : 'Process next batch'}
        </button>

        {lastProcess && (
          <div style={{marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12}}>
            <div>Processed: <strong>{lastProcess.processed}</strong></div>
            <div>Sent now: <strong>{lastProcess.sentNow}</strong></div>
            <div>Skipped (already sent): <strong>{lastProcess.skippedAlreadySent}</strong></div>
            <div>Failed now: <strong>{lastProcess.failedNow}</strong></div>
            <div>Remaining queued (estimate): <strong>{lastProcess.remainingQueuedEstimate ?? '—'}</strong></div>
          </div>
        )}
      </section>

      {error && (
        <div style={{marginTop: 16, color: '#b00020'}}>
          {error}
        </div>
      )}
    </div>
  )
}
