import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Legacy note images load from signed Supabase Storage URLs; R2 images from presigned R2 URLs.
const originOf = (value: string | undefined) => {
  try {
    return new URL(value ?? "").origin;
  } catch {
    return "";
  }
};
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const r2Origin = originOf(process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ""));
const storageOrigins = [supabaseOrigin, r2Origin].filter(Boolean).join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Remote artwork is served same-origin by the authenticated /api/image proxy.
  `img-src 'self' data: blob: ${storageOrigins}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${storageOrigins}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets the Playwright dev server run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: isDev ? "tsconfig.json" : "tsconfig.build.json",
  },
  poweredByHeader: false,
  async redirects() {
    return ["profile", "themes", "frames", "appearance"].map((section) => ({
      source: `/settings/${section}`,
      destination: `/customization/${section}`,
      permanent: true,
    }));
  },
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
