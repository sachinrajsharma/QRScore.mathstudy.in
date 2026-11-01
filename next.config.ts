import type { NextConfig } from "next";
import { legacyRedirects } from "./legacy-redirects";

// Content-Security-Policy, shipped in REPORT-ONLY mode first (see the header
// below). Report-only never blocks a request — the browser only reports what a
// strict policy WOULD have blocked — so it cannot break Turnstile, Google
// Analytics, the Zoho SalesIQ chat, or any page. Deploy, watch the
// browser console / any report endpoint in production (where the real widgets
// load), confirm the allow-lists are complete, then switch the header key to
// "Content-Security-Policy" to enforce.
//
// 'unsafe-inline' is present on script-src on purpose: enforcing via per-request
// nonces would force every page out of static generation into dynamic rendering
// (nonces can't be baked into a static page), which would regress this mostly
// static marketing site's performance. Keeping static rendering is the right
// trade-off here; the JSON-LD stored-XSS vector was already closed separately.
//
// Before flipping to enforcing, confirm against PRODUCTION report-only data:
//   - `'unsafe-eval'` violations seen in `next dev` come from React Refresh /
//     webpack HMR and do NOT occur in a production build — do not add it based
//     on dev noise; verify prod is clean.
//   - Widgets that only load with real keys (Turnstile, GA, Zoho SalesIQ) can
//     pull from origins not visible locally — watch prod reports for any host
//     to add (this is how api.iconify.design was found).
// The BlogForge engine origin (if configured) serves the analytics beacon
// (script), blog cover/inline images, and receives the beacon POST — so it must
// be allow-listed on script-src / img-src / connect-src. Empty when unset.
const blogEngine = (process.env.NEXT_PUBLIC_BLOGFORGE_URL || "").replace(/\/+$/, "");
const blog = blogEngine ? ` ${blogEngine}` : "";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Inline needed for Next.js hydration bootstrap + the GA snippets (dynamic
  // content rules out static hashes; nonces would de-optimize the whole site).
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://salesiq.zohopublic.in https://*.zoho.in https://*.zohostatic.com https://*.zohocdn.com https://checkout.razorpay.com" + blog,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://randomuser.me https://images.unsplash.com https://www.google-analytics.com https://*.zohopublic.in https://*.zoho.in https://*.zohostatic.com https://*.razorpay.com" + blog,
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://challenges.cloudflare.com https://salesiq.zohopublic.in wss://salesiq.zohopublic.in https://*.zoho.in https://api.razorpay.com https://lumberjack.razorpay.com https://api.iconify.design" + blog,
  "frame-src 'self' https://challenges.cloudflare.com https://salesiq.zohopublic.in https://*.zoho.in https://api.razorpay.com https://checkout.razorpay.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data:",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Loaded by Node at run time instead of being bundled: unpdf (pdf.js) and pg use import.meta / native sockets that webpack should not rewrite.
  serverExternalPackages: ["unpdf", "mysql2"],
  outputFileTracingRoot: __dirname,
  // BUILD_STANDALONE=1 (the GitHub Actions build for Hostinger) produces a self-contained server: node server.js. Vercel builds leave it unset.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Files read at run time that the bundler cannot see: the portal migrations (PORTAL_AUTO_MIGRATE) and the data files the portal loads from disk.
  outputFileTracingIncludes: { "/**": ["./db/migrations/2026*.sql", "./lib/abroad/data/study-abroad.json", "./lib/market/data/courses.json", "./lib/tests/data/**/*.json", "./content/lms/**/*.json"] },
  devIndicators: false,
  // Tree-shake heavy barrel-export libraries so only the components actually
  // used land in the client bundle (shrinks the big shared chunk that was
  // eating ~4.5s of main-thread script evaluation).
  experimental: {
    optimizePackageImports: [
      "framer-motion",
      "@iconify/react",
      "lucide-react",
      "react-icons",
    ],
  },
  // The VELORA home page and its four division pages are self-contained files in public/velora-static, served at /velora and /velora/<division>.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/velora", destination: "/velora-static/home.html" },
        { source: "/velora/:division(hire|tech|global|learn)", destination: "/velora-static/:division.html" },
      ],
    };
  },

  // Permanent redirects for URLs that were live and then renamed away without
  // one. Each of these 404'd in production, so any accumulated link equity and
  // index presence was being thrown away. `permanent: true` emits a 308, which
  // Google treats as equivalent to a 301.
  //
  // Rule order matters — Next matches top-down, so the specific
  // /use-cases/individuals rewrite must precede the generic :slug catch-all.
  async redirects() {
    return [
      // Old PHP app addresses (qrscore) -> the Next.js pages that replaced them.
      ...legacyRedirects(),
      // ── /use-cases/* was renamed wholesale to /solutions/* ──────────────
      // "individuals" was separately renamed to "professionals", so it can't
      // ride the 1:1 catch-all below.
      {
        source: "/use-cases/individuals",
        destination: "/solutions/professionals",
        permanent: true,
      },
      // "enterprise" (singular) would ride the catch-all into
      // /solutions/enterprise, which itself 308s to /solutions/enterprises —
      // a two-hop chain. Resolve it straight to the live plural slug.
      {
        source: "/use-cases/enterprise",
        destination: "/solutions/enterprises",
        permanent: true,
      },
      { source: "/use-cases/:slug", destination: "/solutions/:slug", permanent: true },

      // ── Persona rename: individuals → professionals ─────────────────────
      {
        source: "/solutions/individuals",
        destination: "/solutions/professionals",
        permanent: true,
      },

      // ── Enterprise solutions: singular → plural, plus the superseded
      // "-legacy" route (itself created by a folder rename, which is what
      // broke /solutions/enterprise in the first place). ──────────────────
      {
        source: "/solutions/enterprise",
        destination: "/solutions/enterprises",
        permanent: true,
      },
      {
        source: "/solutions/enterprise-legacy",
        destination: "/solutions/enterprises",
        permanent: true,
      },

      // ── Enterprise agents: first-name slugs → descriptive slugs ─────────
      { source: "/enterprise/eva", destination: "/enterprise/capability-builder", permanent: true },
      { source: "/enterprise/finn", destination: "/enterprise/onboarding-co-pilot", permanent: true },
      { source: "/enterprise/maya", destination: "/enterprise/outsourcing-manager", permanent: true },
      { source: "/enterprise/rita", destination: "/enterprise/ai-recruiter", permanent: true },
      { source: "/enterprise/rohan", destination: "/enterprise/workforce-analyst", permanent: true },
      { source: "/enterprise/theo", destination: "/enterprise/attrition-predictor", permanent: true },

      // ── /version2 was the pre-launch homepage. It used to carry its own
      // redirect stub, which was later deleted — re-breaking the very links
      // it existed to preserve. Restored here as a real 308.
      { source: "/version2", destination: "/", permanent: true },

      // Deliberately NOT redirected: /pyramid. It was a dev-only preview route
      // (it rendered the homepage's FoundationSection and nothing else), never
      // public content, so there is no link equity or index presence to
      // preserve. Deleted 2026-07-04; a hard 404 is the correct answer for it.
    ];
  },

  // Baseline security headers. Deliberately no Content-Security-Policy: a
  // script-src policy needs its own report-only pass first, since Razorpay
  // checkout and the Turnstile widget both inject third-party scripts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Non-production deployments serve an identical copy of the site on
          // a crawlable vercel.app host. robots.txt (app/robots.ts) blocks the
          // crawl; this header is the belt-and-braces half, since it also
          // covers URLs a crawler reaches without fetching robots.txt and
          // demotes any that are already indexed. Fail-open: emitted only when
          // SEO_BLOCK_INDEXING is exactly "true", never on production.
          ...(process.env.SEO_BLOCK_INDEXING === "true"
            ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
            : []),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Report-only: surfaces violations without blocking anything. Flip the
          // key to "Content-Security-Policy" to enforce once the allow-list is
          // confirmed against production traffic. See CONTENT_SECURITY_POLICY.
          {
            key: "Content-Security-Policy-Report-Only",
            value: CONTENT_SECURITY_POLICY,
          },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000, // 30 days
    remotePatterns: [
      {
        protocol: "https",
        hostname: "randomuser.me",
        pathname: "/api/portraits/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
