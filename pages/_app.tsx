// pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css"; // <-- adjust path to wherever your globals.css actually is

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
