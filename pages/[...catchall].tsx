import * as React from "react";
import {
  PlasmicComponent,
  extractPlasmicQueryData,
  ComponentRenderData,
  PlasmicRootProvider,
} from "@plasmicapp/loader-nextjs";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import Error from "next/error";
import { useRouter } from "next/router";
import { PLASMIC } from "@/plasmic-init";

type Props = {
  plasmicData?: ComponentRenderData;
  queryCache?: Record<string, unknown>;
};

export default function PlasmicLoaderPage(props: Props) {
  const { plasmicData, queryCache } = props;
  const router = useRouter();

  if (!plasmicData || plasmicData.entryCompMetas.length === 0) {
    return <Error statusCode={404} />;
  }

  const pageMeta = plasmicData.entryCompMetas[0];

  return (
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      prefetchedQueryData={queryCache}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
      pageQuery={router.query}
    >
      <PlasmicComponent component={pageMeta.displayName} />
    </PlasmicRootProvider>
  );
}

function pathOnlyFromResolvedUrl(url: string): string {
  const pathOnly = url.split("?")[0] || "/";
  return pathOnly === "" ? "/" : pathOnly;
}

function plasmicPathFromContext(context: GetServerSidePropsContext): string {
  // Works for BOTH:
  // - the catchall page (/foo/bar) where context.params.catchall exists
  // - delegated pages (/licensing, /artists, /) where params.catchall is undefined
  if (typeof context.resolvedUrl === "string" && context.resolvedUrl.length > 0) {
    return pathOnlyFromResolvedUrl(context.resolvedUrl);
  }

  const catchall = context.params?.catchall;
  if (typeof catchall === "string") return `/${catchall}`;
  if (Array.isArray(catchall)) return `/${catchall.join("/")}`;
  return "/";
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const plasmicPath = plasmicPathFromContext(context);

  const plasmicData = await PLASMIC.maybeFetchComponentData(plasmicPath);
  if (!plasmicData) {
    return { notFound: true };
  }

  const pageMeta = plasmicData.entryCompMetas[0];

  const queryCache = await extractPlasmicQueryData(
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
    >
      <PlasmicComponent component={pageMeta.displayName} />
    </PlasmicRootProvider>
  );

  return { props: { plasmicData, queryCache } };
};
