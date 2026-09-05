import { test as base, expect } from "@playwright/test";
import { TRANSLATIONS_FIXTURE } from "./mocks";

/**
 * Every page load now fetches GET /api/translations before rendering any
 * copy (Этап 3, lib/LocaleContext.tsx) — without a mock for it, every spec
 * would hang on the language-neutral loading state ("…") forever. Rather
 * than repeat that one route mock in every single test, this wraps the
 * base `test` so it's registered automatically before each test body runs.
 * A spec that needs to control the response itself (a specific lang's
 * text, or a failure) still can — mocks.ts's `mockTranslations()` overrides
 * this one (Playwright matches the most-recently-registered handler for an
 * overlapping route first).
 */
export const test = base.extend({
  // Playwright's fixture-teardown parameter is conventionally named `use`,
  // but that literal name false-triggers eslint-plugin-react-hooks's
  // rules-of-hooks check (it treats any call to something named `use(...)`
  // as React's `use()` API, regardless of context) — renamed to sidestep
  // that, no behavior change.
  page: async ({ page }, runTest) => {
    await page.route("**/api/translations**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TRANSLATIONS_FIXTURE) }),
    );
    await runTest(page);
  },
});

export { expect };
