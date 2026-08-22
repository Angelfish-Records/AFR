"use client";

import type { CatalogueEngagementSummary } from "@/lib/catalogue/engagementTypes";
import styles from "@/styles/catalogue-admin.module.css";

type Props = {
  summary: CatalogueEngagementSummary;
};

type Metric = {
  label: string;
  value: number;
  detail: string | null;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

export default function CatalogueEngagementAdmin(props: Props) {
  const { summary } = props;

  const metrics: Metric[] = [
    {
      label: "Sessions",
      value: summary.totals.sessions,
      detail:
        formatNumber(summary.totals.attributedSessions) + " attributed",
    },
    {
      label: "Catalogue opens",
      value: summary.totals.catalogueOpens,
      detail: null,
    },
    {
      label: "Track opens",
      value: summary.totals.detailOpens,
      detail: null,
    },
    {
      label: "Full plays",
      value: summary.totals.fullPlays,
      detail: null,
    },
    {
      label: "Clip plays",
      value: summary.totals.clipPlays,
      detail: null,
    },
    {
      label: "Shortlist adds",
      value: summary.totals.shortlistAdds,
      detail:
        formatNumber(summary.totals.shortlistRemoves) + " removed",
    },
    {
      label: "Licence form opens",
      value: summary.totals.licensingOpens,
      detail: null,
    },
    {
      label: "Enquiries",
      value: summary.totals.enquiries,
      detail:
        formatNumber(summary.totals.attributedEnquiries) + " attributed",
    },
  ];

  return (
    <section className={styles.engagementSection}>
      <div className={styles.engagementHeader}>
        <div>
          <p className={styles.eyebrow}>Catalogue intelligence</p>
          <h2 className={styles.engagementTitle}>Engagement</h2>
          <p className={styles.engagementDescription}>
            Discovery, listening, shortlist intent, and licensing activity
            across the public catalogue.
          </p>
        </div>

        <span className={styles.periodBadge}>
          Last {summary.periodDays} days
        </span>
      </div>

      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{metric.label}</span>

            <strong className={styles.metricValue}>
              {formatNumber(metric.value)}
            </strong>

            <span className={styles.metricDetail}>
              {metric.detail ?? "\u00a0"}
            </span>
          </div>
        ))}
      </div>

      <section className={`${styles.card} ${styles.analyticsCard}`}>
        <div className={styles.analyticsHeader}>
          <div>
            <h3 className={styles.cardTitle}>Recording activity</h3>
            <p className={styles.analyticsDescription}>
              Recordings ranked by observed interaction during this period.
            </p>
          </div>
        </div>

        {summary.recordings.length === 0 ? (
          <p className={styles.empty}>No recording activity yet.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.analyticsTable}>
              <thead>
                <tr>
                  <th scope="col">Recording</th>
                  <th scope="col">Opens</th>
                  <th scope="col">Full</th>
                  <th scope="col">Clips</th>
                  <th scope="col">Shortlists</th>
                </tr>
              </thead>

              <tbody>
                {summary.recordings.map((record) => (
                  <tr key={record.recordingId}>
                    <td>
                      <div className={styles.recordingIdentity}>
                        <strong>
                          {record.title ?? record.recordingId}
                        </strong>
                        <span>{record.recordingId}</span>
                      </div>
                    </td>

                    <td>{formatNumber(record.detailOpens)}</td>
                    <td>{formatNumber(record.fullPlays)}</td>
                    <td>{formatNumber(record.clipPlays)}</td>
                    <td>{formatNumber(record.shortlistAdds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${styles.card} ${styles.analyticsCard}`}>
        <div className={styles.analyticsHeader}>
          <div>
            <h3 className={styles.cardTitle}>Attributed engagement</h3>
            <p className={styles.analyticsDescription}>
              Activity associated with recipient-specific catalogue links.
            </p>
          </div>
        </div>

        {summary.shares.length === 0 ? (
          <p className={styles.empty}>
            No attributed engagement in this period.
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.analyticsTable}>
              <thead>
                <tr>
                  <th scope="col">Recipient / link</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Events</th>
                  <th scope="col">Licence opens</th>
                  <th scope="col">Enquiries</th>
                </tr>
              </thead>

              <tbody>
                {summary.shares.map((share) => {
                  const title =
                    share.recipientName ??
                    share.recipientEmail ??
                    share.label ??
                    "Attributed catalogue link";

                  const detail = [
                    share.recipientEmail,
                    share.label,
                  ]
                    .filter(
                      (value): value is string =>
                        typeof value === "string" &&
                        value.trim().length > 0,
                    )
                    .join(" · ");

                  return (
                    <tr key={share.shareLinkId}>
                      <td>
                        <div className={styles.recordingIdentity}>
                          <strong>{title}</strong>
                          {detail ? <span>{detail}</span> : null}
                        </div>
                      </td>

                      <td>{formatNumber(share.sessions)}</td>
                      <td>{formatNumber(share.events)}</td>
                      <td>{formatNumber(share.licensingOpens)}</td>
                      <td>{formatNumber(share.enquiries)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className={styles.privacyNote}>
        Anonymous sessions are ephemeral. No IP address, user-agent, cookie
        identifier, or persistent browser identifier is stored.
      </p>
    </section>
  );
}
