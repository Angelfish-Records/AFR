import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CatalogueCard from "@/components/catalogue/CatalogueCard";
import CatalogueEmptyState from "@/components/catalogue/CatalogueEmptyState";
import CatalogueGrid from "@/components/catalogue/CatalogueGrid";
import CatalogueHeader from "@/components/catalogue/CatalogueHeader";
import CatalogueLayout from "@/components/catalogue/CatalogueLayout";
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
  const { records } = props;

  return (
    <CatalogueLayout>
      <CatalogueHeader
        title="Sync Catalogue"
        description="A curated selection of release-ready recordings available for sync consideration, presented as a self-contained catalogue surface within Angelfish Records."
      />

      {records.length === 0 ? (
        <CatalogueEmptyState
          title="No catalogue records are currently available"
          body="The configured Airtable view is returning no records yet. Once tracks are added to the dedicated sync view, they will appear here automatically."
        />
      ) : (
        <CatalogueGrid>
          {records.map((record) => (
            <CatalogueCard key={record.id} record={record} />
          ))}
        </CatalogueGrid>
      )}
    </CatalogueLayout>
  );
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