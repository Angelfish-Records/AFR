import styles from "@/styles/catalogue.module.css";

type Props = {
  summary: string | null;
  compact?: boolean;
};

function splitReadinessSummary(summary: string): string[] {
  return summary
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export default function CatalogueReadinessPills(props: Props) {
  const { summary, compact = false } = props;

  if (!summary) {
    return <span className={styles.readinessFallback}>—</span>;
  }

  const items = splitReadinessSummary(summary);

  if (items.length === 0) {
    return <span className={styles.readinessFallback}>—</span>;
  }

  return (
    <div
      className={`${styles.readinessPills} ${
        compact ? styles.readinessPillsCompact : ""
      }`}
    >
      {items.map((item, index) => {
        const variantClass =
          index % 4 === 0
            ? styles.readinessPillA
            : index % 4 === 1
              ? styles.readinessPillB
              : index % 4 === 2
                ? styles.readinessPillC
                : styles.readinessPillD;

        return (
          <span
            key={`${item}-${index}`}
            className={`${styles.readinessPill} ${variantClass}`}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
}