"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue-admin.module.css";

type Props = {
  initialLinks: CatalogueShareLinkSummary[];
  catalogueRecords: CatalogueRecordListItem[];
  afterContent?: ReactNode;
};

type CreateResponse =
  | {
      ok: true;
      link: CatalogueShareLinkSummary;
      shareUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

type RevokeResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export default function CatalogueShareAdmin(props: Props) {
  const [links, setLinks] = useState<CatalogueShareLinkSummary[]>(props.initialLinks);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [label, setLabel] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [curatedRecordingIds, setCuratedRecordingIds] = useState<string[]>([]);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeLinks = useMemo(
    () => links.filter((link) => !link.revokedAt),
    [links]
  );

  const recordTitleById = useMemo(
    () =>
      new Map(
        props.catalogueRecords.map((record) => [
          record.recordingId,
          record.title,
        ]),
      ),
    [props.catalogueRecords],
  );

  function toggleCuratedRecording(recordingId: string): void {
    setCuratedRecordingIds((current) =>
      current.includes(recordingId)
        ? current.filter((value) => value !== recordingId)
        : [...current, recordingId],
    );
  }

  async function handleCreate(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/catalogue/admin/share-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientName,
          recipientEmail,
          label,
          welcomeMessage,
          curatedRecordingIds,
        }),
      });

      const payload = (await response.json()) as CreateResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          response.ok && !payload.ok ? payload.error : "Failed to create link"
        );
      }

      setLinks((current) => [payload.link, ...current]);
      setGeneratedUrl(payload.shareUrl);
      setRecipientName("");
      setRecipientEmail("");
      setLabel("");
      setWelcomeMessage("");
      setCuratedRecordingIds([]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create link");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevoke(id: string): Promise<void> {
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/catalogue/admin/share-links/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const payload = (await response.json()) as RevokeResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          response.ok && !payload.ok ? payload.error : "Failed to revoke link"
        );
      }

      setLinks((current) =>
        current.map((link) =>
          link.id === id
            ? {
                ...link,
                revokedAt: new Date().toISOString(),
              }
            : link
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to revoke link");
    }
  }

  async function handleCopy(): Promise<void> {
    if (!generatedUrl) {
      return;
    }

    await navigator.clipboard.writeText(generatedUrl);
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Angelfish Records</p>
        <h1 className={styles.title}>Catalogue Admin</h1>
        <p className={styles.description}>
          Create attributed catalogue links, prepare tailored track selections,
          and review catalogue engagement. Curated links remain part of the
          public catalogue: recipients can always reveal the full catalogue.
        </p>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Generate curated link</h2>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Recipient / entity</span>
              <input
                className={styles.input}
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="e.g. Alex Rivera"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Recipient email</span>
              <input
                className={styles.input}
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="e.g. alex@example.com"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Internal label / notes</span>
              <input
                className={styles.input}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Sony trailer team"
              />
            </label>

            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.label}>Welcome message</span>
              <textarea
                className={styles.textarea}
                value={welcomeMessage}
                maxLength={600}
                rows={4}
                onChange={(event) => setWelcomeMessage(event.target.value)}
                placeholder="Optional short note shown above the catalogue."
              />
              <span className={styles.fieldHelp}>
                Plain text · {welcomeMessage.length}/600
              </span>
            </label>

            <fieldset className={styles.curationFieldset}>
              <legend className={styles.curationLegend}>
                Curated track selection
              </legend>

              <div className={styles.curationHeader}>
                <div>
                  <strong>
                    {curatedRecordingIds.length === 0
                      ? "Full catalogue"
                      : `${curatedRecordingIds.length} selected`}
                  </strong>
                  <p className={styles.fieldHelp}>
                    No tracks selected means the link opens the full catalogue.
                  </p>
                </div>

                <div className={styles.compactActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      setCuratedRecordingIds(
                        props.catalogueRecords.map(
                          (record) => record.recordingId,
                        ),
                      )
                    }
                  >
                    Select all
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setCuratedRecordingIds([])}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className={styles.trackPickerList}>
                {props.catalogueRecords.map((record) => {
                  const selected = curatedRecordingIds.includes(
                    record.recordingId,
                  );

                  return (
                    <label
                      key={record.recordingId}
                      className={styles.trackPickerItem}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        className={styles.trackPickerCheckbox}
                        onChange={() =>
                          toggleCuratedRecording(record.recordingId)
                        }
                      />

                      <span>
                        <span className={styles.trackPickerTitle}>
                          {record.title}
                        </span>
                        <span className={styles.trackPickerMeta}>
                          {record.recordingId}
                          {record.artistName
                            ? ` · ${record.artistName}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreate()}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Generating…" : "Generate link"}
            </button>
          </div>

          {generatedUrl ? (
            <div className={styles.outputBlock}>
              <span className={styles.label}>Generated share URL</span>
              <div className={styles.outputRow}>
                <input
                  className={styles.outputInput}
                  value={generatedUrl}
                  readOnly
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleCopy()}
                >
                  Copy
                </button>
              </div>
            </div>
          ) : null}

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Active links <span className={styles.count}>{activeLinks.length}</span>
          </h2>

          <div className={styles.linkList}>
            {links.length === 0 ? (
              <p className={styles.empty}>No share links generated yet.</p>
            ) : (
              links.map((link) => {
                const title =
                  link.recipientName ??
                  link.recipientEmail ??
                  link.label ??
                  "Untitled recipient";

                const curatedTitles = link.curatedRecordingIds.map(
                  (recordingId) =>
                    recordTitleById.get(recordingId) ?? recordingId,
                );

                const visibleTitles = curatedTitles.slice(0, 4);
                const remainingTitles = Math.max(
                  curatedTitles.length - visibleTitles.length,
                  0,
                );

                return (
                  <div key={link.id} className={styles.linkItem}>
                    <div className={styles.linkMeta}>
                      <div className={styles.linkTitleRow}>
                        <h3 className={styles.linkTitle}>{title}</h3>
                        {link.revokedAt ? (
                          <span className={styles.badgeMuted}>Revoked</span>
                        ) : (
                          <span className={styles.badge}>Active</span>
                        )}
                      </div>

                      <p className={styles.linkSubline}>
                        {link.recipientEmail ?? "No email"} · Created{" "}
                        {formatDateTime(link.createdAt)}
                      </p>

                      {link.label ? (
                        <p className={styles.linkSubline}>
                          Internal: {link.label}
                        </p>
                      ) : null}

                      <p className={styles.linkCuration}>
                        {curatedTitles.length === 0
                          ? "Full catalogue"
                          : `${curatedTitles.length} curated track${
                              curatedTitles.length === 1 ? "" : "s"
                            }: ${visibleTitles.join(" · ")}${
                              remainingTitles > 0
                                ? ` · +${remainingTitles} more`
                                : ""
                            }`}
                      </p>

                      {link.welcomeMessage ? (
                        <p className={styles.linkWelcome}>
                          {link.welcomeMessage}
                        </p>
                      ) : null}

                      <p className={styles.linkSubline}>
                        Last accessed {formatDateTime(link.lastAccessedAt)}
                      </p>
                    </div>

                    {!link.revokedAt ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => void handleRevoke(link.id)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {props.afterContent}
    </div>
  );
}