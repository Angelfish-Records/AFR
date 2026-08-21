import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { CatalogueLicensingEnquiryResponse } from "@/lib/catalogue/licensingEnquiryTypes";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue-enquiry.module.css";

type Props = {
  isOpen: boolean;
  records: CatalogueRecordListItem[];
  shareToken?: string | null;
  onClose: () => void;
};

function createClientRequestId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `catreq_${globalThis.crypto.randomUUID()}`;
  }

  return `catreq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function CatalogueLicensingEnquiry(props: Props) {
  const { isOpen, records, shareToken = null, onClose } = props;

  const [clientRequestId, setClientRequestId] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [company, setCompany] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mediumUse, setMediumUse] = useState("");
  const [territory, setTerritory] = useState("");
  const [termTimeframe, setTermTimeframe] = useState("");
  const [rightsRequest, setRightsRequest] = useState<
    "full_sync" | "master_only"
  >("full_sync");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingIdsKey = useMemo(
    () => records.map((record) => record.recordingId).join("|"),
    [records],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setClientRequestId(createClientRequestId());
    setRequesterName("");
    setRequesterEmail("");
    setCompany("");
    setProjectName("");
    setMediumUse("");
    setTerritory("");
    setTermTimeframe("");
    setRightsRequest("full_sync");
    setBudget("");
    setDeadline("");
    setNotes("");
    setIsSubmitting(false);
    setIsSubmitted(false);
    setErrorMessage(null);
  }, [isOpen, recordingIdsKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!clientRequestId || records.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const url = new URL(
        "/api/catalogue/licensing-enquiries",
        window.location.origin,
      );

      if (shareToken) {
        url.searchParams.set("st", shareToken);
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          clientRequestId,
          recordingIds: records.map((record) => record.recordingId),
          requesterName,
          requesterEmail,
          company,
          projectName,
          mediumUse,
          territory,
          termTimeframe,
          rightsRequest,
          budget,
          deadline,
          notes,
        }),
      });

      const payload =
        (await response.json()) as CatalogueLicensingEnquiryResponse;

      if (!response.ok || !payload.ok) {
        const message = !payload.ok
          ? payload.error
          : "Unable to submit the licensing enquiry";

        throw new Error(message);
      }

      setIsSubmitted(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the licensing enquiry",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) {
          onClose();
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-enquiry-title"
      >
        <header className={styles.modalHeader}>
          <div>
            <p className={styles.modalEyebrow}>Angelfish Records</p>
            <h2 id="catalogue-enquiry-title" className={styles.modalTitle}>
              Request licence
            </h2>
          </div>

          <button
            type="button"
            className={styles.modalCloseButton}
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close licensing enquiry"
          >
            ×
          </button>
        </header>

        <div className={styles.selectedTracks}>
          <div className={styles.selectedTracksLabel}>
            {records.length} selected recording
            {records.length === 1 ? "" : "s"}
          </div>

          {records.map((record) => (
            <div key={record.recordingId} className={styles.selectedTrack}>
              <span className={styles.selectedTrackId}>
                {record.recordingId}
              </span>
              <span>{record.title}</span>
            </div>
          ))}
        </div>

        {isSubmitted ? (
          <div className={styles.successBlock}>
            <h3>Enquiry received.</h3>
            <p>
              Angelfish Records has received the licensing request and will
              respond using the contact details provided.
            </p>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={onClose}
            >
              CLOSE
            </button>
          </div>
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name *</span>
                <input
                  required
                  maxLength={160}
                  autoComplete="name"
                  className={styles.input}
                  value={requesterName}
                  onChange={(event) => setRequesterName(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Email *</span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  className={styles.input}
                  value={requesterEmail}
                  onChange={(event) => setRequesterEmail(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Company / agency</span>
                <input
                  maxLength={200}
                  autoComplete="organization"
                  className={styles.input}
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Project / production *
                </span>
                <input
                  required
                  maxLength={200}
                  className={styles.input}
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Medium / use *</span>
                <input
                  required
                  maxLength={300}
                  className={styles.input}
                  placeholder="Film, television, trailer, game, advertising…"
                  value={mediumUse}
                  onChange={(event) => setMediumUse(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Territory *</span>
                <input
                  required
                  maxLength={200}
                  className={styles.input}
                  placeholder="Worldwide, New Zealand, North America…"
                  value={territory}
                  onChange={(event) => setTerritory(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Term / timeframe *</span>
                <input
                  required
                  maxLength={300}
                  className={styles.input}
                  placeholder="12 months, perpetuity, campaign window…"
                  value={termTimeframe}
                  onChange={(event) => setTermTimeframe(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Rights needed *</span>
                <select
                  className={styles.input}
                  value={rightsRequest}
                  onChange={(event) =>
                    setRightsRequest(
                      event.target.value === "master_only"
                        ? "master_only"
                        : "full_sync",
                    )
                  }
                >
                  <option value="full_sync">Full sync + master</option>
                  <option value="master_only">Master only</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Budget</span>
                <input
                  maxLength={200}
                  className={styles.input}
                  placeholder="Optional"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Deadline</span>
                <input
                  maxLength={200}
                  className={styles.input}
                  placeholder="Optional"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </label>

              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Notes / context</span>
                <textarea
                  maxLength={4000}
                  rows={4}
                  className={styles.textarea}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>

            <p className={styles.privacyNote}>
              Your details are used to respond to this licensing enquiry. They
              are not added to marketing lists.
            </p>

            {errorMessage ? (
              <div className={styles.errorBlock} role="alert">
                {errorMessage}
              </div>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
                disabled={isSubmitting}
              >
                CANCEL
              </button>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting || !clientRequestId}
              >
                {isSubmitting ? "SENDING…" : "SEND LICENSING ENQUIRY"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
