import styles from "@/styles/catalogue.module.css";

type Props = {
  label: string;
  value: string | string[] | null;
};

export default function CatalogueMetaRow(props: Props) {
  const { label, value } = props;

  if (value === null) {
    return null;
  }

  const renderedValue = Array.isArray(value) ? value.join(", ") : value;

  if (renderedValue.trim().length === 0) {
    return null;
  }

  return (
    <div className={styles.metaRow}>
      <dt className={styles.metaLabel}>{label}</dt>
      <dd className={styles.metaValue}>{renderedValue}</dd>
    </div>
  );
}