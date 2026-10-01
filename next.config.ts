import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Note images upload straight to Supabase Storage and load from signed Storage URLs.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Remote artwork is served same-origin by the authenticated /api/image proxy.
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets the Playwright dev server run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    const shared = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ];
    return [
      {
        source: "/:path((?!api/image$).*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }, ...shared],
      },
      {
        // Proxied artwork (possibly SVG) opened directly must never run script on this origin.
        source: "/api/image",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" }, ...shared],
      },
      {
        // The image proxy and note-image redirects set their own private caching headers.
        source: "/api/:path((?!image$|attachments/).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
