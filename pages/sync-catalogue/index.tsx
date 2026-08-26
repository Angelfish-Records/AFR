import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CatalogueIndexSurface from "@/components/catalogue/CatalogueIndexSurface";
import { toCatalogueListItem } from "@/lib/catalogue/api";
import { resolveCataloguePageAttribution } from "@/lib/catalogue/access";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import type { CatalogueSharePresentation } from "@/lib/catalogue/shareLinkTypes";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";

type Props = {
  records: CatalogueRecordListItem[];
  hasShareAttribution: boolean;
  sharePresentation: CatalogueSharePresentation | null;
};

export default function CatalogueIndexPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return (
    <CatalogueIndexSurface
      records={props.records}
      hasShareAttribution={props.hasShareAttribution}
      sharePresentation={props.sharePresentation}
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

  const sharePresentation: CatalogueSharePresentation | null =
    shareAttribution
      ? {
          recipientName: shareAttribution.recipientName,
          welcomeMessage: shareAttribution.welcomeMessage,
          curatedRecordingIds: shareAttribution.curatedRecordingIds,
        }
      : null;

  return {
    props: {
      records: records.map(toCatalogueListItem),
      hasShareAttribution: shareAttribution !== null,
      sharePresentation,
    },
  };
};
