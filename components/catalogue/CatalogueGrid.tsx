import type { ReactNode } from "react";
import styles from "@/styles/catalogue.module.css";

type Props = {
  children: ReactNode;
};

export default function CatalogueGrid(props: Props) {
  return <section className={styles.grid}>{props.children}</section>;
}