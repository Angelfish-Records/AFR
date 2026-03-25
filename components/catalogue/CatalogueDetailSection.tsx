import type { ReactNode } from "react";
import styles from "@/styles/catalogue.module.css";

type Props = {
  title: string;
  children: ReactNode;
};

export default function CatalogueDetailSection(props: Props) {
  return (
    <section className={styles.detailSection}>
      <h2 className={styles.sectionTitle}>{props.title}</h2>
      <div className={styles.sectionBody}>{props.children}</div>
    </section>
  );
}