import styles from "@/styles/catalogue.module.css";

export type CatalogueFilterKey =
  | "oneStop"
  | "clean"
  | "instrumental"
  | "stems";

type Props = {
  query: string;
  activeFilters: CatalogueFilterKey[];
  visibleCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onToggleFilter: (filter: CatalogueFilterKey) => void;
  onReset: () => void;
};

const FILTERS: Array<{ key: CatalogueFilterKey; label: string }> = [
  { key: "oneStop", label: "ONE-STOP" },
  { key: "clean", label: "CLEAN AVAILABLE" },
  { key: "instrumental", label: "INSTRUMENTAL" },
  { key: "stems", label: "STEMS" },
];

export default function CatalogueDiscoveryBar(props: Props) {
  const hasActiveSearch =
    props.query.trim().length > 0 || props.activeFilters.length > 0;

  return (
    <section
      className={styles.discoveryBar}
      aria-label="Catalogue search and filters"
    >
      <div className={styles.searchWrap}>
        <input
          type="search"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search title, artist, genre, mood or brief language"
          className={styles.searchInput}
          aria-label="Search catalogue"
        />

        <div className={styles.filterMeta}>
          {props.visibleCount} of {props.totalCount} tracks
        </div>
      </div>

      <div className={styles.filterRow}>
        {FILTERS.map((filter) => {
          const isActive = props.activeFilters.includes(filter.key);

          return (
            <button
              key={filter.key}
              type="button"
              className={`${styles.filterButton} ${
                isActive ? styles.filterButtonActive : ""
              }`}
              aria-pressed={isActive}
              onClick={() => props.onToggleFilter(filter.key)}
            >
              {filter.label}
            </button>
          );
        })}

        {hasActiveSearch ? (
          <button
            type="button"
            className={styles.filterReset}
            onClick={props.onReset}
          >
            RESET
          </button>
        ) : null}
      </div>
    </section>
  );
}
