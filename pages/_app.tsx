import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Fraunces, JetBrains_Mono, Inter } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${fraunces.variable} ${jetbrainsMono.variable} ${inter.variable}`}>
      <Component {...pageProps} />
    </main>
  );
}