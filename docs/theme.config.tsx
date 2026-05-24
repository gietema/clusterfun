import React from "react";
import type { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 600 }}>Clusterfun</span>,
  project: {
    link: "https://github.com/gietema/clusterfun",
  },
  docsRepositoryBase: "https://github.com/gietema/clusterfun/tree/main/docs",
  footer: {
    text: `© ${new Date().getFullYear()} Clusterfun`,
  },
  useNextSeoProps() {
    return {
      titleTemplate: "%s – Clusterfun",
    };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Clusterfun documentation" />
    </>
  ),
  primaryHue: 175,
  primarySaturation: 55,
  // Search index is built at build time for static export
  search: { placeholder: "Search docs..." },
};

export default config;
