import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CatalogueAccessRequired from "@/components/catalogue/CatalogueAccessRequired";
import CatalogueIndexSurface from "@/components/catalogue/CatalogueIndexSurface";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { getCataloguePageAccessState } from "@/lib/catalogue/access";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type Props =
  | {
      accessState: "granted";
      records: CatalogueRecordListItem[];
    }
  | {
      accessState: "missing" | "invalid";
      records: CatalogueRecordListItem[];
    };

export default function CatalogueIndexPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.accessState !== "granted") {
    return (
      <CatalogueAccessRequired
        title="Authorisation required"
        body="Ensure you are visiting using the tokenised link provided."
      />
    );
  }

  return <CatalogueIndexSurface records={props.records} />;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const accessState = await getCataloguePageAccessState(context);

  if (accessState !== "granted") {
    return {
      props: {
        accessState,
        records: [],
      },
    };
  }

  const records = await listCatalogueRecords();

  return {
    props: {
      accessState: "granted",
      records: records.map(toCatalogueListItem),
    },
  };
};