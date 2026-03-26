import CatalogueLayout from "@/components/catalogue/CatalogueLayout";
import styles from "@/styles/catalogue.module.css";

type Props = {
  title?: string;
  body?: string;
};

export default function CatalogueAccessRequired(props: Props) {
  const {
    title = "Authorisation required",
    body = "Ensure you are visiting using the tokenised link provided.",
  } = props;

  return (
    <CatalogueLayout title={title} description={body}>
      <div className={styles.accessMessageWrap}>
        <div className={styles.accessMessageCard}>
          <p className={styles.eyebrow}>Angelfish Records</p>
          <h1 className={styles.accessMessageTitle}>{title}</h1>
          <p className={styles.accessMessageBody}>{body}</p>
        </div>
      </div>
    </CatalogueLayout>
  );
}