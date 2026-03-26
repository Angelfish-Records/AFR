import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import CatalogueShareAdmin from "@/components/catalogue/admin/CatalogueShareAdmin";
import { listCatalogueShareLinks } from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

type Props = {
  links: CatalogueShareLinkSummary[];
};

export default function InternalCataloguePage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  return (
    <>
      <Head>
        <title>Catalogue Share Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <CatalogueShareAdmin initialLinks={props.links} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const links = await listCatalogueShareLinks(50);

  return {
    props: {
      links,
    },
  };
};