import styles from "@/styles/catalogue.module.css";

export type CatalogueViewMode = "table" | "grid";

type Props = {
  value: CatalogueViewMode;
  onChange: (value: CatalogueViewMode) => void;
};

export default function CatalogueViewToggle(props: Props) {
  const { value, onChange } = props;

  return (
    <div className={styles.viewToggle}>
      <button
        type="button"
        className={`${styles.viewToggleButton} ${
          value === "table" ? styles.viewToggleButtonActive : ""
        }`}
        onClick={() => onChange("table")}
      >
        List
      </button>

      <button
        type="button"
        className={`${styles.viewToggleButton} ${
          value === "grid" ? styles.viewToggleButtonActive : ""
        }`}
        onClick={() => onChange("grid")}
      >
        Grid
      </button>
    </div>
  );
}