import { defineConfig, devices } from "@playwright/test";

// The suite runs against the real static export (`out/`), not `next dev` —
// that's what actually ships to Render, and it's what lib/api.ts's
// production build-time guard (see tests/api-url-guard.spec.ts) only
// applies to in the first place. NEXT_PUBLIC_API_URL just needs to be SOME
// stable value at build time — every test mocks network calls by path via
// page.route(), not by asserting on this exact origin.
const PORT = 4173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    // No `-s`/`--single`: that flag rewrites every request to the root
    // index.html (SPA fallback), which is wrong here — this is a genuine
    // multi-page static export (/, /cabinet/), and each route must be
    // served its own file so tests actually exercise the right page.
    command: `npm run build && npx serve out -l ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
