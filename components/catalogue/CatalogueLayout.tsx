import Head from "next/head";
import type { ReactNode } from "react";
import {
  CATALOGUE_DESCRIPTION,
  CATALOGUE_TITLE,
} from "@/lib/catalogue/constants";
import styles from "@/styles/catalogue.module.css";

export type CatalogueThemeMode = "dark" | "light";

type Props = {
  title?: string;
  description?: string;
  theme?: CatalogueThemeMode;
  children: ReactNode;
};

export default function CatalogueLayout(props: Props) {
  const {
    title = CATALOGUE_TITLE,
    description = CATALOGUE_DESCRIPTION,
    theme = "dark",
    children,
  } = props;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="/" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div
        className={`${styles.pageShell} ${
          theme === "light" ? styles.pageShellLight : ""
        }`}
        data-catalogue-theme={theme}
      >
        <main className={`${styles.pageInner} ${styles.catalogueRoot}`}>
          {children}
        </main>
      </div>
    </>
  );
}
