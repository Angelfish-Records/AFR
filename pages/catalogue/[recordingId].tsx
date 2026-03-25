import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import CatalogueDetailSection from "@/components/catalogue/CatalogueDetailSection";
import CatalogueLayout from "@/components/catalogue/CatalogueLayout";
import CatalogueMetaRow from "@/components/catalogue/CatalogueMetaRow";
import { hasCatalogueAccess } from "@/lib/catalogue/access";
import { getCatalogueRecordByRecordingId } from "@/lib/catalogue/queries";
import type { CatalogueRecord } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  record: CatalogueRecord;
};

export default function CatalogueDetailPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const { record } = props;

  return (
    <CatalogueLayout
      title={`${record.title} — Sync Catalogue`}
      description={record.shortLogline ?? record.syncReadinessSummary ?? record.title}
    >
      <Link href="/catalogue" className={styles.backLink}>
        ← Back to catalogue
      </Link>

      <header className={styles.detailHero}>
        <p className={styles.detailKicker}>{record.recordingId}</p>
        <h1 className={styles.detailTitle}>{record.title}</h1>
        {(record.shortLogline || record.syncReadinessSummary) && (
          <p className={styles.detailLead}>
            {record.shortLogline ?? record.syncReadinessSummary}
          </p>
        )}
      </header>

      <CatalogueDetailSection title="Overview">
        <dl className={styles.metaList}>
          <CatalogueMetaRow label="Sync readiness" value={record.syncReadinessSummary} />
          <CatalogueMetaRow label="Recording type" value={record.recordingType} />
          <CatalogueMetaRow label="Duration" value={record.duration} />
          <CatalogueMetaRow label="Language" value={record.language} />
          <CatalogueMetaRow label="Genre" value={record.genreLabels} />
          <CatalogueMetaRow label="Mood / tags" value={record.moodTags} />
          <CatalogueMetaRow label="Release date" value={record.releaseDateCurrent} />
          <CatalogueMetaRow label="ISRC" value={record.isrc} />
        </dl>
      </CatalogueDetailSection>

      <CatalogueDetailSection title="Rights & Clearance">
        <dl className={styles.metaList}>
          <CatalogueMetaRow label="Rights coverage" value={record.rightsCoverage} />
          <CatalogueMetaRow label="Geo restrictions" value={record.geoRestrictions} />
          <CatalogueMetaRow label="Known legal risks" value={record.knownLegalRisks} />
          <CatalogueMetaRow label="Master owner" value={record.masterOwner} />
          <CatalogueMetaRow label="Master split" value={record.masterSplitSummary} />
          <CatalogueMetaRow
            label="Composition / publishing split"
            value={record.compositionPublishingSplitSummary}
          />
          <CatalogueMetaRow
            label="Rights administrator"
            value={record.rightsAdministrator}
          />
          <CatalogueMetaRow label="Last reviewed" value={record.lastReviewed} />
        </dl>
      </CatalogueDetailSection>

      <CatalogueDetailSection title="Documentation">
        {record.lyricsPdfLink || record.chainOfTitlePdfLink ? (
          <div className={styles.documentLinks}>
            {record.lyricsPdfLink ? (
              <a
                href={record.lyricsPdfLink}
                target="_blank"
                rel="noreferrer"
                className={styles.documentLink}
              >
                Lyrics PDF
              </a>
            ) : null}

            {record.chainOfTitlePdfLink ? (
              <a
                href={record.chainOfTitlePdfLink}
                target="_blank"
                rel="noreferrer"
                className={styles.documentLink}
              >
                Chain-of-title PDF
              </a>
            ) : null}
          </div>
        ) : (
          <p>No documentation links are currently available for this recording.</p>
        )}
      </CatalogueDetailSection>
    </CatalogueLayout>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  if (!hasCatalogueAccess(context)) {
    return { notFound: true };
  }

  const rawRecordingId = context.params?.recordingId;

  if (typeof rawRecordingId !== "string" || rawRecordingId.trim().length === 0) {
    return { notFound: true };
  }

  const record = await getCatalogueRecordByRecordingId(rawRecordingId);

  if (!record) {
    return { notFound: true };
  }

  return {
    props: {
      record,
    },
  };
};