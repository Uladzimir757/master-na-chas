import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, PROVIDER, SLOT_A, t } from "./mocks";

// Этап 4 — the public live-location dot. ProviderOut.location is either
// present (all three server-side gates already passed — share_location on,
// fix fresh, currently working hours; see app/main.py's
// _resolve_provider_location) or absent; the client never re-derives the
// gating itself, only renders based on presence/absence — see
// components/SlotPicker.tsx.

test("shows the master's live location once a slot with that provider is picked", async ({ page }) => {
  await mockCatalog(page, {
    providers: [{ ...PROVIDER, location: { lat: 54.5189, lng: 18.5305, updated_at: new Date().toISOString() } }],
  });
  await mockAvailability(page, [SLOT_A]);

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  const slotLabel = formatTime(SLOT_A.start_at, "pl");
  await page.getByRole("button", { name: new RegExp(slotLabel) }).click();

  await expect(page.getByText(t.masterLocationTitle)).toBeVisible();
  await expect(page.getByTestId("provider-map")).toBeVisible();
  await expect(page.getByText(t.masterLocationJustNow)).toBeVisible();
});

test("shows nothing extra when the provider has no location set", async ({ page }) => {
  await mockCatalog(page, { providers: [{ ...PROVIDER, location: null }] });
  await mockAvailability(page, [SLOT_A]);

  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  const slotLabel = formatTime(SLOT_A.start_at, "pl");
  await page.getByRole("button", { name: new RegExp(slotLabel) }).click();

  await expect(page.getByText(t.masterLocationTitle)).not.toBeVisible();
  await expect(page.getByTestId("provider-map")).not.toBeVisible();
});
