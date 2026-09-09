import Head from "next/head";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import styles from "@/styles/mux-upload-admin.module.css";

type CreateUploadResponse =
  | { ok: true; uploadId: string; uploadUrl: string }
  | { ok: false; error: string };

type UploadStatusResponse =
  | {
      ok: true;
      uploadStatus: string;
      assetStatus: string | null;
      ready: boolean;
      assetId: string | null;
      playbackId: string | null;
      staticAudioStatus: string | null;
      durationMs: number | null;
    }
  | { ok: false; error: string };

type ReadyResult = {
  uploadId: string;
  assetId: string;
  playbackId: string;
  durationMs: number | null;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreateUploadResponse(
  value: unknown,
): CreateUploadResponse | null {
  if (!isObjectRecord(value)) return null;
  if (value.ok === false) {
    return typeof value.error === "string"
      ? { ok: false, error: value.error }
      : null;
  }
  if (
    value.ok !== true ||
    typeof value.uploadId !== "string" ||
    typeof value.uploadUrl !== "string"
  ) {
    return null;
  }
  return { ok: true, uploadId: value.uploadId, uploadUrl: value.uploadUrl };
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function parseUploadStatusResponse(
  value: unknown,
): UploadStatusResponse | null {
  if (!isObjectRecord(value)) return null;
  if (value.ok === false) {
    return typeof value.error === "string"
      ? { ok: false, error: value.error }
      : null;
  }
  if (
    value.ok !== true ||
    typeof value.uploadStatus !== "string" ||
    !nullableString(value.assetStatus) ||
    typeof value.ready !== "boolean" ||
    !nullableString(value.assetId) ||
    !nullableString(value.playbackId) ||
    !nullableString(value.staticAudioStatus) ||
    !nullableNumber(value.durationMs)
  ) {
    return null;
  }
  return {
    ok: true,
    uploadStatus: value.uploadStatus,
    assetStatus: value.assetStatus,
    ready: value.ready,
    assetId: value.assetId,
    playbackId: value.playbackId,
    staticAudioStatus: value.staticAudioStatus,
    durationMs: value.durationMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function uploadDirectlyToMux(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl, true);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 1000) / 10);
    };

    request.onerror = () =>
      reject(new Error("Network error while uploading to Mux"));
    request.onabort = () => reject(new Error("Mux upload was aborted"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`Mux upload failed (${request.status})`));
    };

    request.send(file);
  });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 0; index < units.length - 1 && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index + 1];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function InternalMuxUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phase, setPhase] = useState("Ready for an audio file.");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<string | null>(null);
  const [staticAudioStatus, setStaticAudioStatus] = useState<string | null>(
    null,
  );
  const [result, setResult] = useState<ReadyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fileSummary = useMemo(
    () => (file ? `${file.name} · ${formatBytes(file.size)}` : null),
    [file],
  );

  function resetRunState(): void {
    setUploadProgress(0);
    setUploadStatus(null);
    setAssetStatus(null);
    setStaticAudioStatus(null);
    setResult(null);
    setError(null);
    setCopiedField(null);
  }

  async function pollUntilReady(uploadId: string): Promise<ReadyResult> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const response = await fetch("/api/catalogue/admin/mux/upload-status", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ uploadId }),
      });

      const payload = parseUploadStatusResponse(await readJson(response));
      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error
            : `Mux status request failed (${response.status})`,
        );
      }

      setUploadStatus(payload.uploadStatus);
      setAssetStatus(payload.assetStatus);
      setStaticAudioStatus(payload.staticAudioStatus);

      if (payload.ready && payload.assetId && payload.playbackId) {
        return {
          uploadId,
          assetId: payload.assetId,
          playbackId: payload.playbackId,
          durationMs: payload.durationMs,
        };
      }

      if (!payload.assetId) {
        setPhase("Upload received. Waiting for Mux to create the asset…");
      } else if (payload.staticAudioStatus !== "ready") {
        setPhase("Asset created. Generating audio.m4a…");
      } else {
        setPhase("Finishing signed playback setup…");
      }

      await sleep(1500);
    }

    throw new Error(
      "Timed out waiting for signed playback and audio.m4a readiness",
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!file || busy) return;

    resetRunState();
    setBusy(true);

    try {
      setPhase("Creating protected Mux upload…");
      const response = await fetch("/api/catalogue/admin/mux/create-upload", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: title.trim() || file.name,
          creatorId: creatorId.trim() || null,
          externalId: externalId.trim() || null,
        }),
      });

      const created = parseCreateUploadResponse(await readJson(response));
      if (!response.ok || !created || !created.ok) {
        throw new Error(
          created && !created.ok
            ? created.error
            : `Could not create Mux upload (${response.status})`,
        );
      }

      setPhase("Uploading source audio directly to Mux…");
      await uploadDirectlyToMux(created.uploadUrl, file, setUploadProgress);
      setPhase("Source upload complete. Waiting for Mux processing…");
      const ready = await pollUntilReady(created.uploadId);
      setResult(ready);
      setPhase("Ready — signed playback and audio.m4a are both available.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
      setPhase("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => {
        setCopiedField((current) => (current === label ? null : current));
      }, 1400);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <>
      <Head>
        <title>Mux Audio Upload · AFR Internal</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Angelfish Records · Internal</p>
            <h1 className={styles.title}>Mux Audio Upload</h1>
            <p className={styles.description}>
              Label-level audio ingestion for Angelfish releases. Every upload
              is created with signed playback and an audio-only static
              rendition; this tool does not report success until Mux confirms
              that <code>audio.m4a</code> is ready.
            </p>
          </div>
          <nav className={styles.nav} aria-label="Internal tools">
            <Link href="/internal/catalogue">Catalogue admin</Link>
            <Link href="/internal/campaign-composer">Campaign composer</Link>
          </nav>
        </header>

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.stepLabel}>01 · Source</p>
                <h2>Upload audio</h2>
              </div>
              <span className={styles.badge}>Mux · signed</span>
            </div>

            <form
              className={styles.form}
              onSubmit={(event) => void handleSubmit(event)}
            >
              <label className={styles.filePicker}>
                <input
                  type="file"
                  accept="audio/*,.wav,.flac,.aif,.aiff"
                  disabled={busy}
                  onChange={(event) => {
                    const nextFile = event.currentTarget.files?.[0] ?? null;
                    setFile(nextFile);
                    resetRunState();
                    if (nextFile) {
                      setTitle(nextFile.name);
                      setPhase("Ready to upload.");
                    }
                  }}
                />
                <span
                  className={
                    file ? styles.filePickerActive : styles.filePickerPrompt
                  }
                >
                  {fileSummary ??
                    "Choose WAV, FLAC, AIFF, M4A, MP3 or other supported audio"}
                </span>
              </label>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Asset title</span>
                  <input
                    value={title}
                    maxLength={512}
                    disabled={busy}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Track Title [Instrumental]"
                  />
                </label>
                <label className={styles.field}>
                  <span>Artist / creator ID</span>
                  <input
                    value={creatorId}
                    maxLength={128}
                    disabled={busy}
                    onChange={(event) => setCreatorId(event.target.value)}
                    placeholder="Optional · e.g. brendan-john-roch"
                  />
                </label>
                <label className={styles.field}>
                  <span>Recording / external ID</span>
                  <input
                    value={externalId}
                    maxLength={128}
                    disabled={busy}
                    onChange={(event) => setExternalId(event.target.value)}
                    placeholder="Optional · e.g. AFR-R-0043"
                  />
                </label>
              </div>

              <p className={styles.help}>
                Metadata is stored on the Mux asset and may be visible through
                Mux playback tooling. Use label identifiers and release
                metadata, not private information.
              </p>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!file || busy}
              >
                {busy ? "Upload in progress…" : "Upload to Mux"}
              </button>
            </form>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.stepLabel}>02 · Processing</p>
                <h2>Readiness</h2>
              </div>
              <span className={result ? styles.readyBadge : styles.badge}>
                {result ? "Ready" : busy ? "Working" : "Idle"}
              </span>
            </div>

            <div className={styles.phase}>{phase}</div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>

            <div className={styles.statusGrid}>
              <div>
                <span>Source upload</span>
                <strong>{uploadProgress.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Direct upload</span>
                <strong>{uploadStatus ?? "—"}</strong>
              </div>
              <div>
                <span>Asset</span>
                <strong>{assetStatus ?? "—"}</strong>
              </div>
              <div>
                <span>audio.m4a</span>
                <strong>{staticAudioStatus ?? "—"}</strong>
              </div>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}
          </section>
        </div>

        {result ? (
          <section className={`${styles.card} ${styles.resultCard}`}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.stepLabel}>03 · Ready</p>
                <h2>Asset output</h2>
              </div>
              <span className={styles.readyBadge}>audio.m4a ready</span>
            </div>

            <div className={styles.outputGrid}>
              <div className={styles.outputItem}>
                <span>Playback ID</span>
                <code>{result.playbackId}</code>
                <button
                  type="button"
                  onClick={() => void handleCopy("playback", result.playbackId)}
                >
                  {copiedField === "playback" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className={styles.outputItem}>
                <span>Duration ms</span>
                <code>{result.durationMs ?? "Unavailable"}</code>
                {result.durationMs !== null ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy("duration", String(result.durationMs))
                    }
                  >
                    {copiedField === "duration" ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
              <div className={styles.outputItem}>
                <span>Duration</span>
                <code>{formatDurationMs(result.durationMs)}</code>
              </div>
              <div className={styles.outputItem}>
                <span>Asset ID</span>
                <code>{result.assetId}</code>
                <button
                  type="button"
                  onClick={() => void handleCopy("asset", result.assetId)}
                >
                  {copiedField === "asset" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className={styles.outputItem}>
                <span>Upload ID</span>
                <code>{result.uploadId}</code>
              </div>
            </div>

            <p className={styles.catalogueNote}>
              This uploader does not write to Airtable. If the asset backs AFR
              catalogue playback, copy the Playback ID and Duration ms into the
              corresponding Recording row, then refresh catalogue snapshots.
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
