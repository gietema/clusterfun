# Clusterfun docs

Standalone [Nextra](https://nextra.site) docs site. Independent of the main Next.js app — own `package.json`, own deploy.

## Develop

```bash
cd docs
npm install
npm run dev   # http://localhost:3001
```

## Authoring

- Pages live under `pages/`. Files: `.mdx` (Markdown + JSX) or `.md`.
- Sidebar order is controlled by `pages/_meta.json` — keys must match filenames (without extension).
- Theme tweaks live in `theme.config.tsx`.

## Build & deploy

```bash
npm run build     # outputs static HTML to ./out (via next.config.mjs's output: "export")
```

Drop the `out/` directory on any static host: Vercel, Netlify, GitHub Pages, S3+CloudFront.

If you want the URL to be `clusterfun.app/docs` rather than `docs.clusterfun.app`, uncomment the `basePath` line in `next.config.mjs`.

## Linking from the main app

The main app's `UnifiedToolbar` opens this site in a new tab via the `DOCS_URL` constant. Change that constant when the docs site has a permanent home.
