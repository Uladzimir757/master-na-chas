import { expect, test } from "@playwright/test";
import { formatTime } from "../lib/format";
import { t } from "../lib/i18n";
import { mockAvailability, mockCatalog, PROVIDER, SLOT_A } from "./mocks";

// Provider.call_out_fee — a flat "выезд" line shown once a client has
// picked a slot, i.e. once a specific provider (not just a service) is
// known (components/SlotPicker.tsx). Purely a display value — see
// app/models.py's Provider.call_out_fee docstring for why.

test("shows the call-out fee once a slot with that provider is picked", async ({ page }) => {
  await mockCatalog(page, { providers: [{ ...PROVIDER, call_out_fee: 50 }] });
  await mockAvailability(page, [SLOT_A]);

  await page.goto("/");
  const slotLabel = formatTime(SLOT_A.start_at);
  await page.getByRole("button", { name: new RegExp(slotLabel) }).click();

  await expect(page.getByText(t.callOutFeeLine(50))).toBeVisible();
});

test("shows no call-out fee line when the provider has none set", async ({ page }) => {
  await mockCatalog(page, { providers: [{ ...PROVIDER, call_out_fee: null }] });
  await mockAvailability(page, [SLOT_A]);

  await page.goto("/");
  const slotLabel = formatTime(SLOT_A.start_at);
  await page.getByRole("button", { name: new RegExp(slotLabel) }).click();

  // "выезд" only ever appears as part of the fee line — its absence is a
  // reliable proxy for "no line was rendered at all"
  await expect(page.getByText("выезд", { exact: false })).not.toBeVisible();
});
