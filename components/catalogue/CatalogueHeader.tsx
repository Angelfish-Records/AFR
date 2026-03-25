import styles from "@/styles/catalogue.module.css";

type Props = {
  eyebrow?: string;
  title: string;
  description: string;
};

export default function CatalogueHeader(props: Props) {
  const { eyebrow = "Angelfish Records", title, description } = props;

  return (
    <header className={styles.header}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.heroTitle}>{title}</h1>
      <p className={styles.heroDescription}>{description}</p>
    </header>
  );
}