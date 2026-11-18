// Production builds are a static export: `next build` writes plain HTML/JS/CSS to out/,
// which the Dockerfile copies into the image for FastAPI to serve. No Node server runs
// in production, so Next.js server features (route handlers, server actions,
// middleware, request-time rendering) are not available. Put server logic in FastAPI.

const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isDev ? undefined : "export",

  // Export /about as out/about/index.html, which FastAPI's StaticFiles serves at /about/.
  trailingSlash: true,

  // The image optimizer needs a Next.js server.
  images: { unoptimized: true },

  // Local development only: `next dev` (port 3000) forwards /api to uvicorn (port 8000),
  // so the browser sees one origin, the same as in production.
  ...(isDev && {
    skipTrailingSlashRedirect: true,
    async rewrites() {
      return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
    },
  }),
};

export default nextConfig;
