import type { ReactNode } from "react";
import styles from "./EssayBody.module.css";

type EssayBodyProps = {
  children?: ReactNode;
  className?: string;
};

export default function EssayBody({
  children,
  className,
}: EssayBodyProps) {
  const rootClassName = className
    ? `${styles.root} ${className}`
    : styles.root;

  return <div className={rootClassName}>{children}</div>;
}
