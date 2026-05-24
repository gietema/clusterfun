import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
  defaultShowCopyCode: true,
});

export default withNextra({
  // Static export so the docs can be served from anywhere (S3, GH Pages, Vercel static, etc.)
  output: "export",
  images: { unoptimized: true },
  // When deploying as docs.clusterfun.app, leave basePath empty.
  // When deploying as clusterfun.app/docs, set basePath: "/docs".
  // basePath: "/docs",
});
