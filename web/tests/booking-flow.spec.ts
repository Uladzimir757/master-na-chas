import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import { bookingResponse, mockAvailability, mockCatalog, mockCreateBooking, SERVICE, SLOT_A, t } from "./mocks";

// The exact manual path from the Neon smoke test this project ran earlier:
// load the service -> pick a slot -> fill name/phone -> submit -> success
// screen, for both branches of Provider.requires_booking_confirmation.
for (const status of ["pending", "confirmed"] as const) {
  test(`booking happy path ends in success screen (${status})`, async ({ page }) => {
    await mockCatalog(page);
    await mockAvailability(page, [SLOT_A]);
    await mockCreateBooking(page, () => ({ status: 201, body: bookingResponse(status) }));

    await page.goto("/");

    // single seeded service -> BookingFlow auto-selects it, no "pick a
    // service" screen to click through first
    await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();

    const slotLabel = formatTime(SLOT_A.start_at, "pl");
    await page.getByRole("button", { name: new RegExp(slotLabel) }).click();

    await page.getByPlaceholder(t.namePlaceholder).fill("Иван");
    await page.getByPlaceholder(t.phonePlaceholder).fill("+48123456789");
    await page.getByRole("button", { name: t.submitBooking }).click();

    await expect(page.getByText(t.bookingCreatedTitle)).toBeVisible();
    const expectedNote = status === "pending" ? t.bookingPending : t.bookingConfirmed;
    await expect(page.getByText(expectedNote)).toBeVisible();
  });
}
