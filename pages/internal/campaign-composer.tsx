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

function handleUndoRedoKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const key = e.key.toLowerCase()

  // Undo: Cmd+Z (mac) / Ctrl+Z (win)
  const isUndo = (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && key === 'z'

  // Redo:
  // - Mac commonly: Cmd+Shift+Z
  // - Windows commonly: Ctrl+Y (also Ctrl+Shift+Z in some apps)
  const isRedo =
    ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && key === 'z') || (!isMac && e.ctrlKey && !e.shiftKey && key === 'y')

  if (!isUndo && !isRedo) return

  // Prevent browser "back" / other weird defaults in some contexts
  e.preventDefault()

  // Ask the browser to do native undo/redo for this textarea
  try {
    document.execCommand(isUndo ? 'undo' : 'redo')
  } catch {
    // no-op: most modern browsers still support this for contenteditable/textarea,
    // and the textarea usually still handles it natively anyway.
  }
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  insert: string,
  selectRange?: [number, number]
) {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length

  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)

  textarea.value = before + insert + after

  const cursorPos =
    selectRange
      ? start + selectRange[0]
      : start + insert.length

  textarea.focus()
  textarea.setSelectionRange(
    cursorPos,
    selectRange ? start + selectRange[1] : cursorPos
  )
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

  const [subjectTemplate, setSubjectTemplate] = useState('News from Angelfish Records')
  const [bodyTemplate, setBodyTemplate] = useState(
    `Kia ora {{first_name}},

This is a beautiful message beaming to you from Angelfish Records, pulling from an Airtable database and routing through a custom next.js app that integrates Resend.

I came across your work years ago when I read {{one_line_hook}}

We could say something tailored to you and your outlet right now. {{custom_paragraph}}

— Angus
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
    }
  }, [picked])

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

    const hazardStripe = (angleDeg: number) =>
    `repeating-linear-gradient(${angleDeg}deg,
      rgba(255, 205, 0, 0.95) 0px,
      rgba(255, 205, 0, 0.95) 10px,
      rgba(0, 0, 0, 0.95) 10px,
      rgba(0, 0, 0, 0.95) 20px
    )`

  const hazardCardStyle: React.CSSProperties = {
    marginTop: 14,
    borderRadius: 14,
    border: `1px solid rgba(255,205,0,0.35)`,
    background: 'rgba(255,255,255,0.035)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  }

  const hazardEdgeStyle: React.CSSProperties = {
    height: 10,
    opacity: 0.55,
    filter: 'saturate(1.05)',
  }

  function IconBold(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h6a4 4 0 0 1 0 8H8V4Zm0 8h7a4 4 0 1 1 0 8H8v-8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconItalic(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 4h10M4 20h10M14 4l-4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconLink(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconImage(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 10a1.5 1.5 0 1 0 0.001 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function IconDivider(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6v1M12 6v1M16 6v1M8 17v1M12 17v1M16 17v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconH2(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6v12M12 6v12M4 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16 11a2 2 0 1 1 4 0c0 1-1 1.5-2 2.2-1 .7-2 1.2-2 2.8h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconBullets(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 7h11M9 12h11M9 17h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 7h.01M5 12h.01M5 17h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
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
          subject: previewSubject,
          bodyText: previewBody,
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
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
  <h1 style={{marginTop: 0, marginBottom: 0}}>AFR Campaign Composer</h1>

  <a
    href="https://airtable.com/appsHyPfRvjmH60ix"
    target="_blank"
    rel="noreferrer"
    title="Open Airtable campaign database"
    style={{display: 'inline-flex', alignItems: 'center'}}
  >
    <img
      src="https://www.angelfishrecords.com/gfx/airtable_logo.png"
      alt="Airtable"
      style={{height: 30, opacity: 0.9}}
    />
  </a>
</div>


      <div style={{padding: 12, borderRadius: 12, marginTop: 10, marginBottom: 16}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
  <label>
    <select value={outletType} onChange={(e) => setOutletType(e.target.value)} style={{...inputStyle, minWidth: 160}}>
      <option value="">Outlet Type</option>
      {outletTypeOptions.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  </label>

  <label>
    <select value={outletRegion} onChange={(e) => setOutletRegion(e.target.value)} style={{...inputStyle, minWidth: 160}}>
      <option value="">Outlet Region</option>
      {outletRegionOptions.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  </label>

  <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(186,156,103,0.18)', // AFR gold, muted
              border: '1px solid rgba(186,156,103,0.45)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Mailable Contacts&nbsp;
            <b style={{marginLeft: 6}}>{audienceCount ?? '—'}</b>
          </div>

  <button onClick={loadAudience} disabled={loading} style={{padding: '10px 14px', borderRadius: 10}}>
    Refresh Audience
  </button>

  <button
    onClick={refreshPreviewHtml}
    disabled={previewLoading || !picked}
    style={{padding: '10px 14px', borderRadius: 10}}
  >
    Refresh Preview
  </button>
</div>

      </div>

      {/* 1/3 + 2/3 layout */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16}}>
        {/* LEFT: slightly smaller typography */}
        <div style={{padding: 12, borderRadius: 12, fontSize: 14}}>
          <h2 style={{marginTop: 0, marginBottom: 5, fontSize: 18}}>Compose</h2>

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

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Subject template</div>
            <input value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} style={inputStyle} />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
  <div style={labelTitleStyleLeft}>Body template</div>

  {/* Joined control: toolbar + textarea */}
  <div
    style={{
      border: `1px solid ${surfaceBorder}`,
      borderRadius: 12,
      overflow: 'hidden',
      background: surfaceBg,
    }}
  >
    {/* Toolbar (top) */}
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: 8,
        borderBottom: `1px solid ${surfaceBorder}`,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {[
        {
          title: 'Bold',
          icon: <IconBold />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '**bold text**', [2, 11])
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Italic',
          icon: <IconItalic />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '*italic text*', [1, 12])
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Link',
          icon: <IconLink />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '[link text](https://)', [1, 10])
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Image',
          icon: <IconImage />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '![alt text](https://image-url)', [2, 10])
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Divider',
          icon: <IconDivider />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '\n\n---\n\n')
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Heading',
          icon: <IconH2 />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '\n\n## Heading text\n\n', [4, 16])
            setBodyTemplate(el.value)
          },
        },
        {
          title: 'Bullets',
          icon: <IconBullets />,
          run: () => {
            const el = document.getElementById('body-template') as HTMLTextAreaElement | null
            if (!el) return
            insertAtCursor(el, '\n\n- Bullet one\n- Bullet two\n- Bullet three\n\n', [4, 14])
            setBodyTemplate(el.value)
          },
        },
      ].map((b) => (
        <button
          key={b.title}
          type="button"
          onClick={b.run}
          title={b.title}
          aria-label={b.title}
          style={{
            width: 34,
            height: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            border: `1px solid ${surfaceBorder}`,
            background: 'rgba(255,255,255,0.04)',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {b.icon}
        </button>
      ))}
    </div>

    {/* Textarea (bottom) */}
    <textarea
      id="body-template"
      value={bodyTemplate}
      onChange={(e) => setBodyTemplate(e.target.value)}
      onKeyDown={(e) => {handleUndoRedoKeydown(e)}}
      rows={24}
      style={{
        width: '100%',
        padding: 12,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color: 'inherit',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        resize: 'vertical',
      }}
    />
  </div>
</label>


          <div style={{marginTop: 12, fontSize: 11, opacity: 0.7}}>
            Tokens supported:{' '}
            <code>
              {
                '{{first_name}} {{last_name}} {{full_name}} {{email}} {{outlet}} {{one_line_hook}} {{custom_paragraph}}'
              }
            </code>
          </div>

                    {/* --- SEND HAZARD ZONE --- */}
          <div style={hazardCardStyle}>
            {/* top hazard edge */}
            <div style={{...hazardEdgeStyle, backgroundImage: hazardStripe(45)}} />

            <div style={{padding: 12}}>
              <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
                <div style={{fontSize: 12, fontWeight: 700, letterSpacing: 0.6, opacity: 0.92}}>
                  SEND ZONE
                  <span style={{marginLeft: 10, fontWeight: 500, opacity: 0.7}}>
                    This triggers real email activity.
                  </span>
                </div>

                <div style={{fontSize: 11, opacity: 0.75}}>
                  Double-check filters • sender • templates • campaign ID
                </div>
              </div>

              <div style={{height: 10}} />

              {/* (1) Enqueue row */}
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

              {/* (2) Action row */}
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

                <button
                  onClick={() => drainOnce(25)}
                  disabled={loading || !campaignId}
                  style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
                >
                  Drain 25
                </button>
                <button
                  onClick={() => drainOnce(50)}
                  disabled={loading || !campaignId}
                  style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
                >
                  Drain 50
                </button>
                <button
                  onClick={() => drainOnce(100)}
                  disabled={loading || !campaignId}
                  style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
                >
                  Drain 100
                </button>
              </div>

              {/* (3) Status box */}
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
                    <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>
                      Another drain is likely running. Try again shortly.
                    </div>
                  </div>
                )}

                {sendStatus.state === 'error' && (
                  <div style={{fontSize: 12, color: '#b00020'}}>
                    <b>Error:</b> {sendStatus.message}
                  </div>
                )}
              </div>
            </div>

            {/* bottom hazard edge */}
            <div style={{...hazardEdgeStyle, backgroundImage: hazardStripe(-45)}} />
          </div>

        </div>

        {/* RIGHT: keep default sizing */}
        <div style={{padding: 12, borderRadius: 12}}>
          <h2 style={{marginTop: 0, marginBottom: 5, fontSize: 18}}>Preview</h2>

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
