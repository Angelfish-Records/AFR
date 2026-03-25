import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CatalogueIndexSurface from "@/components/catalogue/CatalogueIndexSurface";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { hasCatalogueAccess } from "@/lib/catalogue/access";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type Props = {
  records: CatalogueRecordListItem[];
};

export default function CatalogueIndexPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  return <CatalogueIndexSurface records={props.records} />;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  if (!hasCatalogueAccess(context)) {
    return { notFound: true };
  }

  const records = await listCatalogueRecords();

  return {
    props: {
      records: records.map(toCatalogueListItem),
    },
  };
};