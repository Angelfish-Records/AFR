import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import {
  getExportRecordsByRecordingIds,
  type CatalogueExportRecord,
} from "@/lib/catalogue/export";
import { hasCatalogueAccess } from "@/lib/catalogue/access";
import styles from "@/styles/catalogue-print.module.css";

type Props = {
  records: CatalogueExportRecord[];
};

function joinValues(values: string[]): string {
  return values.length > 0 ? values.join(" • ") : "—";
}

export default function CataloguePrintPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const { records } = props as Props;

  return (
    <>
      <Head>
        <title>Angelfish Records — Print Shortlist</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className={styles.printPage}>
        <div className={styles.printToolbar}>
          <button
            type="button"
            onClick={() => window.print()}
            className={styles.printButton}
          >
            Print / Save as PDF
          </button>
        </div>

        <div className={styles.printSheet}>
          <header className={styles.printHeader}>
            <div className={styles.printEyebrow}>Angelfish Records</div>
            <h1 className={styles.printTitle}>Sync Shortlist</h1>
            <p className={styles.printIntro}>
              Selected recordings prepared for sync consideration.
            </p>
          </header>

          {records.length === 0 ? (
            <div className={styles.emptyPrintState}>
              No tracks were selected for this print view.
            </div>
          ) : null}

          {records.map((record) => (
            <section key={record.recordingId} className={styles.recordBlock}>
              <div className={styles.recordHeader}>
                <div>
                  <div className={styles.recordingId}>{record.recordingId}</div>
                  <h2 className={styles.recordTitle}>{record.title}</h2>
                  {record.logline ? (
                    <p className={styles.recordLogline}>{record.logline}</p>
                  ) : null}
                </div>

                <div className={styles.recordMetaTop}>
                  <div>{record.audio.duration ?? "—"}</div>
                  <div>Preview start: {record.audio.previewLabel ?? "—"}</div>
                </div>
              </div>

              <div className={styles.pillRow}>
                {record.readiness.pills.length > 0 ? (
                  record.readiness.pills.map((pill) => (
                    <span key={pill} className={styles.pill}>
                      {pill}
                    </span>
                  ))
                ) : (
                  <span className={styles.muted}>No readiness summary</span>
                )}
              </div>

              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Recording type</div>
                  <div className={styles.metaValue}>
                    {record.descriptors.recordingType ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Language</div>
                  <div className={styles.metaValue}>
                    {record.descriptors.language ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Genre</div>
                  <div className={styles.metaValue}>
                    {joinValues(record.descriptors.genreLabels)}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Mood / tags</div>
                  <div className={styles.metaValue}>
                    {joinValues(record.descriptors.moodTags)}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Rights coverage</div>
                  <div className={styles.metaValue}>
                    {record.rights.coverage ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Known legal risks</div>
                  <div className={styles.metaValue}>
                    {record.rights.knownLegalRisks ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Master owner</div>
                  <div className={styles.metaValue}>
                    {record.rights.masterOwner ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>Rights administrator</div>
                  <div className={styles.metaValue}>
                    {record.rights.rightsAdministrator ?? "—"}
                  </div>
                </div>
                <div className={styles.metaItem}>
                  <div className={styles.metaLabel}>ISRC</div>
                  <div className={styles.metaValue}>
                    {record.identifiers.isrc ?? "—"}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const hasAccess = await hasCatalogueAccess(context);

  if (!hasAccess) {
    return {
      notFound: true,
    };
  }

  const idsParam = context.query.ids;
  const idsRaw =
    typeof idsParam === "string"
      ? idsParam
      : Array.isArray(idsParam)
        ? (idsParam[0] ?? "")
        : "";

  const recordingIds = Array.from(
    new Set(
      idsRaw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (recordingIds.length === 0) {
    return {
      props: {
        records: [],
      },
    };
  }

  const records = await getExportRecordsByRecordingIds(recordingIds);

  return {
    props: {
      records,
    },
  };
};
