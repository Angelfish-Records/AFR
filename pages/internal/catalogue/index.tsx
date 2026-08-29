import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import CatalogueEngagementAdmin from "@/components/catalogue/admin/CatalogueEngagementAdmin";
import CatalogueShareAdmin from "@/components/catalogue/admin/CatalogueShareAdmin";
import CatalogueSnapshotAdmin from "@/components/catalogue/admin/CatalogueSnapshotAdmin";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { readAirtableContentSnapshot } from "@/lib/catalogue/contentSnapshots";
import { getCatalogueEngagementSummary } from "@/lib/catalogue/engagement";
import type { CatalogueEngagementSummary } from "@/lib/catalogue/engagementTypes";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import { listCatalogueShareLinks } from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type SnapshotStatus = {
  itemCount: number;
  refreshedAt: string;
};

type Props = {
  links: CatalogueShareLinkSummary[];
  records: CatalogueRecordListItem[];
  engagement: CatalogueEngagementSummary;
  syncSnapshot: SnapshotStatus;
  websiteSnapshot: SnapshotStatus;
};

function toSnapshotStatus(snapshot: {
  itemCount: number;
  refreshedAt: string;
}): SnapshotStatus {
  return {
    itemCount: snapshot.itemCount,
    refreshedAt: snapshot.refreshedAt,
  };
}

export default function InternalCataloguePage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return (
    <>
      <Head>
        <title>Catalogue Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <CatalogueShareAdmin
        initialLinks={props.links}
        catalogueRecords={props.records}
        afterContent={
          <>
            <CatalogueEngagementAdmin summary={props.engagement} />
            <CatalogueSnapshotAdmin
              initialSyncSnapshot={props.syncSnapshot}
              initialWebsiteSnapshot={props.websiteSnapshot}
            />
          </>
        }
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const [
    links,
    records,
    engagement,
    syncSnapshot,
    websiteSnapshot,
  ] = await Promise.all([
    listCatalogueShareLinks(50),
    listCatalogueRecords(),
    getCatalogueEngagementSummary(30),
    readAirtableContentSnapshot("sync_catalogue"),
    readAirtableContentSnapshot("website_catalogue"),
  ]);

  if (!syncSnapshot || !websiteSnapshot) {
    throw new Error(
      "Catalogue content snapshots are not fully initialised",
    );
  }

  return {
    props: {
      links,
      records: records.map(toCatalogueListItem),
      engagement,
      syncSnapshot: toSnapshotStatus(syncSnapshot),
      websiteSnapshot: toSnapshotStatus(websiteSnapshot),
    },
  };
};
