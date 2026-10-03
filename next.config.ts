import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This distribution is a pnpm workspace. Pin Turbopack to the application
  // root so Next.js does not walk up to a user's parent package-lock.json.
  turbopack: {
    root: __dirname,
  },
  // Server-side PDF page rendering (app/api/ai-guru/material-studio/page-image)
  // must load these from node_modules at runtime instead of bundling them.
  // Bundled, pdfjs looks for ./pdf.worker.mjs next to the compiled chunk
  // ("Setting up fake worker failed: Cannot find module .../chunks/pdf.worker.mjs")
  // and @napi-rs/canvas' native binding cannot be resolved (DOMMatrix/Path2D
  // polyfill warnings) - every page-image request then answered 500.
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
};

export default nextConfig;
