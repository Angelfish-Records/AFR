import styles from "@/styles/catalogue.module.css";

type Props = {
  recipientName: string | null;
  welcomeMessage: string | null;
  hasCuratedSelection: boolean;
  isShowingFullCatalogue: boolean;
  curatedCount: number;
  totalCount: number;
  onToggleCatalogueScope: () => void;
};

export default function CatalogueCuratedIntro(props: Props) {
  const eyebrow = props.recipientName
    ? `CURATED FOR ${props.recipientName}`
    : props.hasCuratedSelection
      ? "CURATED SELECTION"
      : "ANGELFISH RECORDS";

  return (
    <section
      className={styles.curatedIntro}
      aria-label="Curated catalogue introduction"
    >
      <div className={styles.curatedIntroCopy}>
        <p className={styles.curatedIntroEyebrow}>{eyebrow}</p>

        {props.welcomeMessage ? (
          <p className={styles.curatedIntroMessage}>
            {props.welcomeMessage}
          </p>
        ) : null}

        {props.hasCuratedSelection ? (
          <p className={styles.curatedIntroMeta}>
            {props.isShowingFullCatalogue
              ? `Showing the full catalogue · ${props.totalCount} tracks.`
              : `Showing ${props.curatedCount} selected ${
                  props.curatedCount === 1 ? "track" : "tracks"
                } from the ${props.totalCount}-track catalogue.`}
          </p>
        ) : null}
      </div>

      {props.hasCuratedSelection ? (
        <button
          type="button"
          className={styles.curatedIntroButton}
          onClick={props.onToggleCatalogueScope}
        >
          {props.isShowingFullCatalogue
            ? "RETURN TO CURATED SELECTION"
            : "VIEW FULL CATALOGUE"}
        </button>
      ) : null}
    </section>
  );
}
