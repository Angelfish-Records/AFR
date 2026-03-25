import styles from "@/styles/catalogue.module.css";

type Props = {
  title: string;
  body: string;
};

export default function CatalogueEmptyState(props: Props) {
  return (
    <div className={styles.emptyState}>
      <h2 className={styles.emptyStateTitle}>{props.title}</h2>
      <p className={styles.emptyStateBody}>{props.body}</p>
    </div>
  );
}