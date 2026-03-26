import type { GetServerSideProps } from "next";
import { getCataloguePageAccessState } from "@/lib/catalogue/access";

type Props = Record<string, never>;

export default function CatalogueDetailRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const accessState = await getCataloguePageAccessState(context);

  if (accessState !== "granted") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const rawRecordingId = context.params?.recordingId;

  if (typeof rawRecordingId !== "string" || rawRecordingId.trim().length === 0) {
    return { notFound: true };
  }

  const shareToken =
    typeof context.query.st === "string"
      ? context.query.st
      : typeof context.query.t === "string"
      ? context.query.t
      : null;

  const searchParams = new URLSearchParams();
  searchParams.set("recordingId", rawRecordingId);

  if (shareToken) {
    searchParams.set("st", shareToken);
  }

  return {
    redirect: {
      destination: `/?${searchParams.toString()}`,
      permanent: false,
    },
  };
};