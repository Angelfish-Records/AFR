"use client";

import { useMemo, useState } from "react";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";
import styles from "@/styles/catalogue-admin.module.css";

type Props = {
  initialLinks: CatalogueShareLinkSummary[];
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
  const [expiresAt, setExpiresAt] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeLinks = useMemo(
    () => links.filter((link) => !link.revokedAt),
    [links]
  );

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
          expiresAt: expiresAt || null,
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
      setExpiresAt("");
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
        <h1 className={styles.title}>Catalogue Share Links</h1>
        <p className={styles.description}>
          Generate unique share links for music supervisors, publishers, and sync
          partners. Each link can expire or be revoked independently.
        </p>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Generate new link</h2>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Recipient name</span>
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
              <span className={styles.label}>Label / notes</span>
              <input
                className={styles.input}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Sony trailer team"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Expires at</span>
              <input
                type="datetime-local"
                className={styles.input}
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
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

                      <p className={styles.linkSubline}>
                        Expires {formatDateTime(link.expiresAt)} · Last accessed{" "}
                        {formatDateTime(link.lastAccessedAt)}
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
    </div>
  );
}