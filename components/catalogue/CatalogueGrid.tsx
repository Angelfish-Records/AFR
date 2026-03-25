import CatalogueCard from "@/components/catalogue/CatalogueCard";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
  onSelect: (recordingId: string) => void;
};

export default function CatalogueGrid(props: Props) {
  const { records, onSelect } = props;

  return (
    <section className={styles.grid}>
      {records.map((record) => (
        <CatalogueCard
          key={record.id}
          record={record}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}