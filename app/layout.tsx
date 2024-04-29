import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// The following import prevents a Font Awesome icon server-side rendering bug,
// where the icons flash from a very large icon down to a properly sized one:
import "@fortawesome/fontawesome-svg-core/styles.css";
// Prevent fontawesome from adding its CSS since we did it manually above:
import { config } from "@fortawesome/fontawesome-svg-core";
import Head from "next/head";
config.autoAddCss = false; /* eslint-disable import/first */

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clusterfun",
  description: "Explore data with one line of code",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <Head>
        <title>Clusterfun - A python plotting library to explore data</title>
        <meta
          name="description"
          content="Clusterfun - A python plotting library to explore data."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@gietema" />
        <meta name="twitter:creator" content="@gietema" />
        <meta property="og:url" content="https://clusterfun.app" />
        <meta
          property="og:title"
          content="Clusterfun - easily explore data in plots"
        />
        <meta
          property="og:description"
          content="Inspect, filter, search and share. A python library to explore data in plots."
        />
        <meta property="og:image" content="https://clusterfun.app/share.png" />
        <meta
          name="twitter:description"
          content="Inspect, filter, search and share. A python library to explore data in plots."
        />
        <meta name="twitter:image" content="https://clusterfun.app/share.png" />

        <meta property="og:url" content="https://clusterfun.app" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Clusterfun - easily explore data in plots"
        />
        <meta
          property="og:description"
          content="Inspect, filter, search and share. A python library to explore data in plots."
        />
        <meta
          property="og:image"
          content="https://clusterfun.app/share-clt.png"
        />
        <script
          src="https://kit.fontawesome.com/1c414fe52d.js"
          crossOrigin="anonymous"
         />
      </Head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
