import type { Metadata } from "next";
import { Alegreya_Sans, Cinzel } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-display" });
const body = Alegreya_Sans({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Ripcord — the captain steers, you hold the rope",
  description:
    "A curated Uniswap v4 vault where every depositor sets their own floor. When your share falls to it, the hook pulls you out.",
  icons: { icon: "/mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {/* background art layer: drop scenes/canvas in here, pages are transparent above it */}
        <div className="backdrop" aria-hidden="true" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
