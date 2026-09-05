import { expect, test } from "@playwright/test";
import { formatTime } from "../lib/format";
import { t } from "../lib/i18n";
import { bookingResponse, mockAvailability, mockCatalog, mockCreateBooking, SLOT_A, SLOT_B } from "./mocks";

test("a 409 on submit surfaces the taken-slot message and lets the visitor pick another slot", async ({ page }) => {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A, SLOT_B]);
  await mockCreateBooking(page, (callIndex) =>
    callIndex === 0
      ? { status: 409, body: { detail: "Slot was just booked by someone else" } }
      : { status: 201, body: bookingResponse("pending", SLOT_B) },
  );

  await page.goto("/");

  const labelA = formatTime(SLOT_A.start_at);
  const labelB = formatTime(SLOT_B.start_at);

  await page.getByRole("button", { name: new RegExp(labelA) }).click();
  await page.getByPlaceholder(t.namePlaceholder).fill("Иван");
  await page.getByRole("button", { name: t.submitBooking }).click();

  await expect(page.getByText(t.slotTakenError)).toBeVisible();

  // the form isn't broken: the slot grid is back (loadAvailability() re-ran),
  // and the other slot is still pickable
  const slotBButton = page.getByRole("button", { name: new RegExp(labelB) });
  await expect(slotBButton).toBeVisible();
  await slotBButton.click();
  await page.getByRole("button", { name: t.submitBooking }).click();

  await expect(page.getByText(t.bookingCreatedTitle)).toBeVisible();
});
