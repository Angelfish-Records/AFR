import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import CatalogueEngagementAdmin from "@/components/catalogue/admin/CatalogueEngagementAdmin";
import CatalogueShareAdmin from "@/components/catalogue/admin/CatalogueShareAdmin";
import { getCatalogueEngagementSummary } from "@/lib/catalogue/engagement";
import type { CatalogueEngagementSummary } from "@/lib/catalogue/engagementTypes";
import { listCatalogueShareLinks } from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

type Props = {
  links: CatalogueShareLinkSummary[];
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
        afterContent={
          <CatalogueEngagementAdmin summary={props.engagement} />
        }
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const [links, engagement] = await Promise.all([
    listCatalogueShareLinks(50),
    getCatalogueEngagementSummary(30),
  ]);

  return {
    props: {
      links,
      engagement,
    },
  };
};
