// pages/internal/campaign-composer.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react'

type SampleContact = {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  outlet: string
  oneLineHook: string
  customParagraph: string
}

function mergeTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '')
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

type EnqueueGetResponse = {
  ok: true
  audienceKey: string
  mailableCount: number
  sampleContacts: SampleContact[]
  availableOutletTypes: string[]
  availableOutletRegions: string[]
  appliedFilters?: {outletType: string | null; outletRegion: string | null}
}

type EnqueuePostResponse = {
  ok: true
  audienceKey: string
  campaignId: string
  enqueued: number
}

type DrainResponse = {
  ok: true
  sent: number
  remainingQueued: number
  nextPollMs?: number
  runId?: string
}

type ApiErrorShape = {
  error?: string
  code?: string
  message?: string
  runId?: string
}

type PreviewResponse =
  | {ok: true; subject: string; html: string}
  | {ok?: false; error?: string; message?: string}

type SenderKey = 'brendan' | 'angus'

const SENDERS: Record<SenderKey, {from: string; replyTo: string}> = {
  brendan: {
    from: 'Brendan at Angelfish Records <brendan@press.angelfishrecords.com>',
    replyTo: 'brendan@press.angelfishrecords.com',
  },
  angus: {
    from: 'Angus at Angelfish Records <angus@press.angelfishrecords.com>',
    replyTo: 'angus@press.angelfishrecords.com',
  },
}

export default function CampaignComposerPage() {
  const [loading, setLoading] = useState(false)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [sampleContacts, setSampleContacts] = useState<SampleContact[]>([])
  const [samplePick, setSamplePick] = useState<string>('')

  // Audience filters
  const [outletType, setOutletType] = useState<string>('') // '' means All
  const [outletRegion, setOutletRegion] = useState<string>('') // '' means All
  const [outletTypeOptions, setOutletTypeOptions] = useState<string[]>([])
  const [outletRegionOptions, setOutletRegionOptions] = useState<string[]>([])

  const [senderKey, setSenderKey] = useState<SenderKey>('brendan')

  const sender = useMemo(() => SENDERS[senderKey] ?? SENDERS.brendan, [senderKey])
  const replyTo = sender.replyTo

  const [campaignName, setCampaignName] = useState('')

  const [subjectTemplate, setSubjectTemplate] = useState('Angelfish Records: {{campaign_name}}')
  const [bodyTemplate, setBodyTemplate] = useState(
    `Kia ora {{first_name}},

{{one_line_hook}}

{{custom_paragraph}}

Key links:
{{key_links}}

Assets pack:
{{assets_pack_link}}

— Brendan
`
  )

  const [campaignId, setCampaignId] = useState<string>('')

  const picked = useMemo(() => {
    const c = sampleContacts.find((x) => x.id === samplePick) ?? sampleContacts[0]
    return c ?? null
  }, [sampleContacts, samplePick])

  const previewVars = useMemo(() => {
    const c = picked
    return {
      first_name: c?.firstName ?? '',
      last_name: c?.lastName ?? '',
      full_name: c?.fullName ?? '',
      email: c?.email ?? '',
      outlet: c?.outlet ?? '',
      one_line_hook: c?.oneLineHook ?? '',
      custom_paragraph: c?.customParagraph ?? '',
      campaign_name: campaignName || '(campaign)',
      // These are placeholders in the UI; your drain.ts pulls real values from Airtable Campaigns fields.
      key_links: '(set in Airtable Campaigns.Key links)',
      assets_pack_link: '(set in Airtable Campaigns.Assets pack link)',
      default_cta: '(set in Airtable Campaigns.Default CTA)',
    }
  }, [picked, campaignName])

  const previewSubject = useMemo(() => mergeTemplate(subjectTemplate, previewVars), [subjectTemplate, previewVars])
  const previewBody = useMemo(() => mergeTemplate(bodyTemplate, previewVars), [bodyTemplate, previewVars])

  // ---- Server-side HTML preview state ----
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewErr, setPreviewErr] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewReqIdRef = useRef(0)

  // --- styling helpers (match the existing dark UI, avoid forced white surfaces) ---
  const surfaceBg = 'rgba(255,255,255,0.06)'
  const surfaceBorder = 'rgba(255,255,255,0.14)'
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${surfaceBorder}`,
    background: surfaceBg,
    color: 'inherit',
  }
  const labelTitleStyleLeft: React.CSSProperties = {fontSize: 10, opacity: 0.7, marginBottom: 6}
  const labelTitleStyleRight: React.CSSProperties = {fontSize: 12, opacity: 0.7, marginBottom: 6}

  async function refreshPreviewHtml() {
    const reqId = ++previewReqIdRef.current
    setPreviewLoading(true)
    setPreviewErr('')

    try {
      const recipientName = picked?.firstName || picked?.fullName || ''
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          brandName: 'Angelfish Records',
          logoUrl: 'https://www.angelfishrecords.com/brand/AFR_logo_circle_light_mini.png',
          recipientName,
          campaignName: previewVars.campaign_name,
          subject: previewSubject,
          bodyText: previewBody,
          defaultCta: previewVars.default_cta,
          keyLinks: previewVars.key_links,
          assetsPackLink: previewVars.assets_pack_link,
        }),
      })

      const j = (await res.json().catch(() => null)) as PreviewResponse | null
      if (reqId !== previewReqIdRef.current) return // drop stale responses

      if (!res.ok || !j || (j as {ok?: unknown}).ok !== true) {
        const msg =
          (j && (typeof (j as {error?: unknown}).error === 'string' ? (j as {error: string}).error : '')) ||
          (j && (typeof (j as {message?: unknown}).message === 'string' ? (j as {message: string}).message : '')) ||
          'Preview failed'
        throw new Error(msg)
      }

      setPreviewHtml((j as {ok: true; html: string}).html)
    } catch (e) {
      if (reqId !== previewReqIdRef.current) return
      setPreviewErr(errorMessage(e))
      setPreviewHtml('')
    } finally {
      if (reqId !== previewReqIdRef.current) return
      setPreviewLoading(false)
    }
  }

  // debounce preview refresh on inputs
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!picked) return
      refreshPreviewHtml()
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.id, previewSubject, previewBody, outletType, outletRegion])

  // ---- sending state ----
  const [sendStatus, setSendStatus] = useState<
    | {state: 'idle'}
    | {
        state: 'sending'
        campaignId: string
        totalSent: number
        lastSent: number
        remainingQueued: number
        loops: number
        startedAtMs: number
        runId?: string
      }
    | {state: 'done'; campaignId: string; totalSent: number; endedAtMs: number}
    | {state: 'error'; message: string}
    | {state: 'locked'; message: string}
    | {state: 'cancelled'; campaignId: string; totalSent: number}
  >({state: 'idle'})

  const [cancelToken, setCancelToken] = useState(0)

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  function pickErrMsg(j: unknown, fallback: string) {
    const o = j as ApiErrorShape | null
    return (typeof o?.error === 'string' && o.error) || (typeof o?.message === 'string' && o.message) || fallback
  }

  function cancelSending() {
    setCancelToken((x) => x + 1)
  }

  async function loadAudience() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('audienceKey', 'press_mailable_v1')
      if (outletType) params.set('outletType', outletType)
      if (outletRegion) params.set('outletRegion', outletRegion)

      const res = await fetch(`/api/campaigns/enqueue?${params.toString()}`)
      const j = (await res.json().catch(() => null)) as unknown

      if (!res.ok) {
        const msg =
          typeof (j as {error?: unknown} | null)?.error === 'string'
            ? (j as {error: string}).error
            : 'Failed to load audience'
        throw new Error(msg)
      }

      const data = j as EnqueueGetResponse
      setAudienceCount(typeof data.mailableCount === 'number' ? data.mailableCount : null)
      setSampleContacts(Array.isArray(data.sampleContacts) ? data.sampleContacts : [])

      setOutletTypeOptions(Array.isArray(data.availableOutletTypes) ? data.availableOutletTypes : [])
      setOutletRegionOptions(Array.isArray(data.availableOutletRegions) ? data.availableOutletRegions : [])

      if (data.sampleContacts?.[0]?.id) setSamplePick(data.sampleContacts[0].id)
    } catch (e: unknown) {
      alert(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudience()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletType, outletRegion])

  async function enqueue() {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns/enqueue', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          audienceKey: 'press_mailable_v1',
          campaignName: campaignName || undefined,
          senderKey,
          subjectTemplate,
          bodyTemplate,
          outletType: outletType || undefined,
          outletRegion: outletRegion || undefined,
        }),
      })
      const j = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const msg =
          typeof (j as {error?: unknown} | null)?.error === 'string' ? (j as {error: string}).error : 'Enqueue failed'
        throw new Error(msg)
      }
      const data = j as EnqueuePostResponse
      setCampaignId(data.campaignId)
      alert(`Enqueued ${data.enqueued} sends.\nCampaign: ${data.campaignId}`)
    } catch (e: unknown) {
      alert(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function drainOnce(limit: number) {
    if (!campaignId) return alert('No campaignId yet — enqueue first.')
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns/drain', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({campaignId, limit}),
      })
      const j = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const msg = pickErrMsg(j, 'Drain failed')
        throw new Error(msg)
      }
      const data = j as DrainResponse
      alert(`Sent ${data.sent}.\nRemaining queued: ${data.remainingQueued}`)
    } catch (e: unknown) {
      alert(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function sendAutoDrain(opts?: {limit?: number; maxLoops?: number}) {
    if (!campaignId) return alert('No campaignId yet — enqueue first.')

    const limit = Math.max(1, Math.min(100, Math.floor(opts?.limit ?? 50)))
    const maxLoops = Math.max(1, Math.min(50, Math.floor(opts?.maxLoops ?? 50)))
    const startedAtMs = Date.now()
    const myCancelToken = cancelToken

    setSendStatus({
      state: 'sending',
      campaignId,
      totalSent: 0,
      lastSent: 0,
      remainingQueued: Number.NaN,
      loops: 0,
      startedAtMs,
    })

    setLoading(true)
    try {
      let totalSent = 0
      let loops = 0
      let remainingQueued = Infinity
      let lastRunId: string | undefined

      while (loops < maxLoops && remainingQueued > 0) {
        if (cancelToken !== myCancelToken) {
          setSendStatus({state: 'cancelled', campaignId, totalSent})
          return
        }

        loops++

        const res = await fetch('/api/campaigns/drain', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({campaignId, limit}),
        })

        const j = (await res.json().catch(() => null)) as unknown

        if (!res.ok) {
          const code = (j as ApiErrorShape | null)?.code
          const msg = pickErrMsg(j, 'Drain failed')

          if (res.status === 409 || code === 'CAMPAIGN_LOCKED') {
            setSendStatus({state: 'locked', message: msg})
            return
          }

          throw new Error(msg)
        }

        const data = j as DrainResponse
        const sentThis = typeof data.sent === 'number' ? data.sent : 0
        remainingQueued = typeof data.remainingQueued === 'number' ? data.remainingQueued : remainingQueued
        lastRunId = typeof data.runId === 'string' ? data.runId : lastRunId

        totalSent += sentThis

        setSendStatus({
          state: 'sending',
          campaignId,
          totalSent,
          lastSent: sentThis,
          remainingQueued: Number.isFinite(remainingQueued) ? remainingQueued : 0,
          loops,
          startedAtMs,
          runId: lastRunId,
        })

        if (remainingQueued <= 0) break

        const nextPollMs =
          typeof data.nextPollMs === 'number' && Number.isFinite(data.nextPollMs)
            ? Math.max(0, Math.min(5000, Math.floor(data.nextPollMs)))
            : 900

        if (cancelToken !== myCancelToken) {
          setSendStatus({state: 'cancelled', campaignId, totalSent})
          return
        }

        await sleep(nextPollMs)
      }

      setSendStatus({state: 'done', campaignId, totalSent, endedAtMs: Date.now()})
    } catch (e: unknown) {
      setSendStatus({state: 'error', message: errorMessage(e)})
    } finally {
      setLoading(false)
    }
  }

  const iframeSrcDoc = useMemo(() => {
    if (!previewHtml) return ''
    return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">${previewHtml}</body></html>`
  }, [previewHtml])

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '24px auto',
        padding: 16,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <h1 style={{marginTop: 0}}>Campaign Composer (Internal)</h1>

      <div style={{padding: 12, borderRadius: 12, marginBottom: 16}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
          <button onClick={loadAudience} disabled={loading} style={{padding: '10px 14px', borderRadius: 10}}>
            Refresh audience
          </button>

          <button
            onClick={refreshPreviewHtml}
            disabled={previewLoading || !picked}
            style={{padding: '10px 14px', borderRadius: 10}}
            title="Force refresh the server-rendered HTML preview"
          >
            Refresh preview
          </button>

          <div style={{fontSize: 14, opacity: 0.85}}>
            Mailable contacts: <b>{audienceCount ?? '—'}</b>
          </div>

          <div style={{fontSize: 12, opacity: 0.7}}>
            Preview: {previewLoading ? 'rendering…' : previewHtml ? 'ready' : previewErr ? 'error' : '—'}
          </div>
        </div>
      </div>

      {/* 1/3 + 2/3 layout */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16}}>
        {/* LEFT: slightly smaller typography */}
        <div style={{padding: 12, borderRadius: 12, fontSize: 14}}>
          <h2 style={{marginTop: 0, fontSize: 18}}>Compose</h2>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Campaign name (optional)</div>
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} style={inputStyle} />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Sender (From + Reply-To)</div>
            <select
              value={senderKey}
              onChange={(e) => setSenderKey(e.target.value as SenderKey)}
              style={inputStyle}
            >
              <option value="brendan">{SENDERS.brendan.from}</option>
              <option value="angus">{SENDERS.angus.from}</option>
            </select>

            <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>
              Reply-To: <code>{replyTo}</code>
            </div>
          </label>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10}}>
            <label style={{display: 'block'}}>
              <div style={labelTitleStyleLeft}>Outlet Type (audience filter)</div>
              <select value={outletType} onChange={(e) => setOutletType(e.target.value)} style={inputStyle}>
                <option value="">All types</option>
                {outletTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label style={{display: 'block'}}>
              <div style={labelTitleStyleLeft}>Outlet Region (audience filter)</div>
              <select value={outletRegion} onChange={(e) => setOutletRegion(e.target.value)} style={inputStyle}>
                <option value="">All regions</option>
                {outletRegionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Subject template</div>
            <input value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} style={inputStyle} />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Body template</div>
            <textarea
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={14}
              style={{
                ...inputStyle,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            />
          </label>

          <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
            <button
              onClick={enqueue}
              disabled={loading || sendStatus.state === 'sending'}
              style={{padding: '10px 14px', borderRadius: 10}}
            >
              Enqueue campaign
            </button>

            <div style={{fontSize: 12, opacity: 0.85}}>
              Campaign ID:{' '}
              <code
                style={{
                  background: surfaceBg,
                  border: `1px solid ${surfaceBorder}`,
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                {campaignId || '—'}
              </code>
            </div>
          </div>

          <div style={{marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
            <button
              onClick={() => sendAutoDrain({limit: 50, maxLoops: 50})}
              disabled={loading || !campaignId || sendStatus.state === 'sending'}
              style={{padding: '10px 14px', borderRadius: 10}}
            >
              Send campaign (auto-drain)
            </button>

            <button
              onClick={cancelSending}
              disabled={sendStatus.state !== 'sending'}
              style={{padding: '10px 14px', borderRadius: 10}}
            >
              Cancel
            </button>

            <button onClick={() => drainOnce(25)} disabled={loading || !campaignId} style={{padding: '10px 14px', borderRadius: 10}}>
              Drain 25
            </button>
            <button onClick={() => drainOnce(50)} disabled={loading || !campaignId} style={{padding: '10px 14px', borderRadius: 10}}>
              Drain 50
            </button>
            <button onClick={() => drainOnce(100)} disabled={loading || !campaignId} style={{padding: '10px 14px', borderRadius: 10}}>
              Drain 100
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${surfaceBorder}`,
              background: surfaceBg,
            }}
          >
            {sendStatus.state === 'idle' && <div style={{fontSize: 12, opacity: 0.8}}>Ready.</div>}

            {sendStatus.state === 'sending' && (
              <div style={{fontSize: 12}}>
                <div>
                  <b>Sending…</b> Total sent: <b>{sendStatus.totalSent}</b> • Last batch: {sendStatus.lastSent} • Remaining
                  queued: <b>{Number.isFinite(sendStatus.remainingQueued) ? sendStatus.remainingQueued : '—'}</b> • Batches:{' '}
                  {sendStatus.loops}
                </div>
                {sendStatus.runId ? (
                  <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>
                    runId:{' '}
                    <code
                      style={{
                        background: 'transparent',
                        border: `1px solid ${surfaceBorder}`,
                        padding: '1px 6px',
                        borderRadius: 6,
                      }}
                    >
                      {sendStatus.runId}
                    </code>
                  </div>
                ) : null}
              </div>
            )}

            {sendStatus.state === 'done' && (
              <div style={{fontSize: 12}}>
                <b>Done.</b> Sent <b>{sendStatus.totalSent}</b> total.
              </div>
            )}

            {sendStatus.state === 'cancelled' && (
              <div style={{fontSize: 12}}>
                <b>Cancelled.</b> Sent <b>{sendStatus.totalSent}</b> before stopping.
              </div>
            )}

            {sendStatus.state === 'locked' && (
              <div style={{fontSize: 12}}>
                <b>Blocked:</b> {sendStatus.message}
                <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>Another drain is likely running. Try again shortly.</div>
              </div>
            )}

            {sendStatus.state === 'error' && (
              <div style={{fontSize: 12, color: '#b00020'}}>
                <b>Error:</b> {sendStatus.message}
              </div>
            )}
          </div>

          <div style={{marginTop: 12, fontSize: 11, opacity: 0.7}}>
            Tokens supported:{' '}
            <code>
              {
                '{{first_name}} {{last_name}} {{full_name}} {{email}} {{outlet}} {{one_line_hook}} {{custom_paragraph}} {{campaign_name}} {{key_links}} {{assets_pack_link}} {{default_cta}}'
              }
            </code>
          </div>
        </div>

        {/* RIGHT: keep default sizing */}
        <div style={{padding: 12, borderRadius: 12}}>
          <h2 style={{marginTop: 0, fontSize: 18}}>Preview</h2>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleRight}>Sample recipient</div>
            <select value={samplePick} onChange={(e) => setSamplePick(e.target.value)} style={inputStyle}>
              {sampleContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName || c.email} — {c.email}
                </option>
              ))}
            </select>
          </label>

          <div style={{marginBottom: 10}}>
            <div style={labelTitleStyleRight}>Rendered subject</div>
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: surfaceBg,
                border: `1px solid ${surfaceBorder}`,
              }}
            >
              {previewSubject}
            </div>
          </div>

          <div style={{marginBottom: 10}}>
            <div style={labelTitleStyleRight}>
              HTML email preview (server-rendered){previewLoading ? ' — rendering…' : ''}
            </div>

            {previewErr ? (
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(176,0,32,0.12)',
                  border: '1px solid rgba(176,0,32,0.35)',
                  color: '#ffb3c0',
                }}
              >
                <b>Preview error:</b> {previewErr}
              </div>
            ) : (
              <iframe
                title="email-preview"
                srcDoc={iframeSrcDoc}
                style={{
                  width: '100%',
                  height: 520,
                  border: `1px solid ${surfaceBorder}`,
                  borderRadius: 10,
                  background: surfaceBg, // avoid forced white
                }}
                sandbox="allow-same-origin"
              />
            )}
          </div>

          <div>
            <div style={labelTitleStyleRight}>Rendered plaintext (what you store in Campaign body)</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                padding: 10,
                borderRadius: 10,
                background: surfaceBg, // avoid forced white
                border: `1px solid ${surfaceBorder}`,
                margin: 0,
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              {previewBody}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
