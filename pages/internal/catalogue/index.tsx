import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import CatalogueEngagementAdmin from "@/components/catalogue/admin/CatalogueEngagementAdmin";
import CatalogueShareAdmin from "@/components/catalogue/admin/CatalogueShareAdmin";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { getCatalogueEngagementSummary } from "@/lib/catalogue/engagement";
import type { CatalogueEngagementSummary } from "@/lib/catalogue/engagementTypes";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import { listCatalogueShareLinks } from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type Props = {
  links: CatalogueShareLinkSummary[];
  records: CatalogueRecordListItem[];
  engagement: CatalogueEngagementSummary;
};

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
          <CatalogueEngagementAdmin summary={props.engagement} />
        }
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const [links, records, engagement] = await Promise.all([
    listCatalogueShareLinks(50),
    listCatalogueRecords(),
    getCatalogueEngagementSummary(30),
  ]);

  return {
    props: {
      links,
      records: records.map(toCatalogueListItem),
      engagement,
    },
  };
};
