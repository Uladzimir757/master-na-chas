import { formatDayLabel, formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, SLOT_A, t } from "./mocks";

// Nothing bookable left today (too close to start — confirm window + travel,
// app/slot_engine.py min_booking_lead): say when the nearest free time is.
test("when today has no slots the page names the nearest free time", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]); // SLOT_A is a future day, not today
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();

  const when = `${formatDayLabel(SLOT_A.start_at, "pl", t)}, ${formatTime(SLOT_A.start_at, "pl")}`;
  await expect(page.getByText(t.nearestSlot(when))).toBeVisible();
});
