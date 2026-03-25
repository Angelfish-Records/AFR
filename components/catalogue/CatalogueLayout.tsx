import Head from "next/head";
import type { ReactNode } from "react";
import { CATALOGUE_DESCRIPTION, CATALOGUE_TITLE } from "@/lib/catalogue/constants";
import styles from "@/styles/catalogue.module.css";

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export default function CatalogueLayout(props: Props) {
  const {
    title = CATALOGUE_TITLE,
    description = CATALOGUE_DESCRIPTION,
    children,
  } = props;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.pageShell}>
        <main className={styles.pageInner}>{children}</main>
      </div>
    </>
  );
}