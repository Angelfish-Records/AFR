import type { GetServerSideProps } from "next";
import { resolveCataloguePageAttribution } from "@/lib/catalogue/access";

type Props = Record<string, never>;

export default function CatalogueDetailRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const rawRecordingId = context.params?.recordingId;

  if (
    typeof rawRecordingId !== "string" ||
    rawRecordingId.trim().length === 0
  ) {
    return {
      notFound: true,
    };
  }

  const shareAttribution =
    await resolveCataloguePageAttribution(context);

  const rawShareToken =
    typeof context.query.st === "string"
      ? context.query.st
      : typeof context.query.t === "string"
        ? context.query.t
        : null;

  const searchParams = new URLSearchParams();
  searchParams.set("recordingId", rawRecordingId.trim());

  if (shareAttribution && rawShareToken?.trim()) {
    searchParams.set("st", rawShareToken.trim());
  }

  return {
    redirect: {
      destination: `/?${searchParams.toString()}`,
      permanent: false,
    },
  };
};
