import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CatalogueIndexSurface from "@/components/catalogue/CatalogueIndexSurface";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { resolveCataloguePageAttribution } from "@/lib/catalogue/access";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type Props = {
  records: CatalogueRecordListItem[];
  hasShareAttribution: boolean;
};

export default function CatalogueIndexPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return (
    <CatalogueIndexSurface
      records={props.records}
      hasShareAttribution={props.hasShareAttribution}
    />
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const [shareAttribution, records] = await Promise.all([
    resolveCataloguePageAttribution(context),
    listCatalogueRecords(),
  ]);

  return {
    props: {
      records: records.map(toCatalogueListItem),
      hasShareAttribution: shareAttribution !== null,
    },
  };
};
