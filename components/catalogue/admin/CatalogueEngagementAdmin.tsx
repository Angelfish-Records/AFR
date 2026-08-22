"use client";

import type { CatalogueEngagementSummary } from "@/lib/catalogue/engagementTypes";
import styles from "@/styles/catalogue-admin.module.css";

type Props = {
  summary: CatalogueEngagementSummary;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

export default function CatalogueEngagementAdmin(props: Props) {
  const { summary } = props;

  const metrics = [
    ["Sessions", summary.totals.sessions],
    ["Attributed sessions", summary.totals.attributedSessions],
    ["Catalogue opens", summary.totals.catalogueOpens],
    ["Detail opens", summary.totals.detailOpens],
    ["Full plays", summary.totals.fullPlays],
    ["Clip plays", summary.totals.clipPlays],
    ["Shortlist adds", summary.totals.shortlistAdds],
    ["Shortlist removes", summary.totals.shortlistRemoves],
    ["Licence form opens", summary.totals.licensingOpens],
    ["Enquiries", summary.totals.enquiries],
    ["Attributed enquiries", summary.totals.attributedEnquiries],
  ] as const;

  return (
    <>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Catalogue intelligence</p>
        <h2 className={styles.title}>Engagement</h2>
        <p className={styles.description}>
          Aggregate first-party interaction counts for the last{" "}
          {summary.periodDays} days. Anonymous sessions are ephemeral and no
          IP address, user-agent, cookie identifier, or persistent browser
          identifier is stored.
        </p>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Funnel · {summary.periodDays} days
          </h2>

          <div className={styles.linkList}>
            {metrics.map(([label, value]) => (
              <div key={label} className={styles.linkItem}>
                <div className={styles.linkMeta}>
                  <div className={styles.linkTitleRow}>
                    <h3 className={styles.linkTitle}>{label}</h3>
                    <span className={styles.badge}>
                      {formatNumber(value)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Recording activity</h2>

          <div className={styles.linkList}>
            {summary.recordings.length === 0 ? (
              <p className={styles.empty}>No recording activity yet.</p>
            ) : (
              summary.recordings.map((record) => (
                <div
                  key={record.recordingId}
                  className={styles.linkItem}
                >
                  <div className={styles.linkMeta}>
                    <div className={styles.linkTitleRow}>
                      <h3 className={styles.linkTitle}>
                        {record.title ?? record.recordingId}
                      </h3>
                      <span className={styles.badgeMuted}>
                        {record.recordingId}
                      </span>
                    </div>

                    <p className={styles.linkSubline}>
                      Detail {formatNumber(record.detailOpens)}
                      {" · "}Full {formatNumber(record.fullPlays)}
                      {" · "}Clip {formatNumber(record.clipPlays)}
                      {" · "}Shortlist {formatNumber(record.shortlistAdds)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Attributed engagement</h2>

          <div className={styles.linkList}>
            {summary.shares.length === 0 ? (
              <p className={styles.empty}>
                No attributed engagement in this period.
              </p>
            ) : (
              summary.shares.map((share) => {
                const title =
                  share.recipientName ??
                  share.recipientEmail ??
                  share.label ??
                  "Attributed catalogue link";

                return (
                  <div
                    key={share.shareLinkId}
                    className={styles.linkItem}
                  >
                    <div className={styles.linkMeta}>
                      <div className={styles.linkTitleRow}>
                        <h3 className={styles.linkTitle}>{title}</h3>

                        {share.enquiries > 0 ? (
                          <span className={styles.badge}>
                            {formatNumber(share.enquiries)}{" "}
                            {share.enquiries === 1
                              ? "enquiry"
                              : "enquiries"}
                          </span>
                        ) : null}
                      </div>

                      <p className={styles.linkSubline}>
                        {share.label ?? "No label"}
                        {" · "}
                        {formatNumber(share.sessions)} sessions
                        {" · "}
                        {formatNumber(share.events)} events
                        {" · "}
                        {formatNumber(share.licensingOpens)} licence-form opens
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </>
  );
}
