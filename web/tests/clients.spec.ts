import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  cabinetBooking,
  mockAuthMe,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  openTab,
  serviceToggle,
  t,
} from "./mocks";

// «Клиенты» в кабинете: карта клиента (история, заметки) и личный чёрный
// список — он только предупреждает, заказы не блокирует.

const PHONE = "+48600100200";
const ROW = {
  phone: PHONE, name: "Jan Kowalski", orders: 3, completed: 2, cancelled: 1, no_show: 0,
  revenue: "150.00", last_at: "2026-09-10T09:00:00Z", blocked: false, has_note: false,
};
const CARD = {
  ...ROW, last_at: ROW.last_at, note: null, blocked: false, block_reason: null, block_comment: null, blocked_at: null,
  history: [
    { id: "b1", start_at: "2026-09-10T09:00:00Z", service_name: "Montaż", status: "completed", price: "100.00" },
    { id: "b2", start_at: "2026-09-01T09:00:00Z", service_name: "Naprawa", status: "cancelled", price: null },
  ],
};

async function openClients(page: Page, row = ROW, card: Record<string, unknown> = CARD) {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  let current = { ...card };
  await page.route("**/api/providers/me/clients**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "PUT") {
      const body = JSON.parse(req.postData() ?? "{}");
      puts.push({ url: url.pathname, body });
      if (url.pathname.endsWith("/blacklist")) {
        current = body.blocked
          ? { ...current, blocked: true, block_reason: body.reason, block_comment: body.comment || null }
          : { ...current, blocked: false, block_reason: null, block_comment: null };
      } else current = { ...current, note: body.note };
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    if (url.pathname.endsWith("/card")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
    }
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ ...row, blocked: Boolean(current.blocked), has_note: Boolean(current.note) }]),
    });
  });
  await page.goto("/cabinet/");
  await openTab(page, t.tabClients);
  return puts;
}

test("the clients tab lists clients and a card shows stats and history", async ({ page }) => {
  await openClients(page);

  await expect(page.getByText("Jan Kowalski")).toBeVisible();
  await page.getByText("Jan Kowalski").click();

  await expect(page.getByRole("heading", { name: "Jan Kowalski" })).toBeVisible();
  await expect(page.getByText("150.00")).toBeVisible();
  await expect(page.getByText(/Montaż/)).toBeVisible();
  await expect(page.getByText(/Naprawa/)).toBeVisible();
});

test("search narrows the list by name or phone", async ({ page }) => {
  await openClients(page);
  await expect(page.getByText("Jan Kowalski")).toBeVisible();

  await page.getByRole("searchbox").fill("anna");
  await expect(page.getByText(t.clientsEmpty)).toBeVisible();
  await page.getByRole("searchbox").fill("600100");
  await expect(page.getByText("Jan Kowalski")).toBeVisible();
});

test("a note is saved only with the button", async ({ page }) => {
  const puts = await openClients(page);
  await page.getByText("Jan Kowalski").click();

  await page.getByRole("textbox", { name: t.clientNoteTitle }).fill("Pies w domu");
  await page.waitForTimeout(300);
  expect(puts).toHaveLength(0);

  await page.getByRole("button", { name: t.clientNoteSave }).click();
  await expect(page.getByText(t.clientNoteSaved)).toBeVisible();
  expect(puts).toEqual([{ url: "/api/providers/me/clients/note", body: { phone: PHONE, note: "Pies w domu" } }]);
});

test("blacklisting asks for a reason, shows the warning and can be undone", async ({ page }) => {
  const puts = await openClients(page);
  await page.getByText("Jan Kowalski").click();

  await page.getByRole("button", { name: t.clientBlacklistAdd }).click();
  await page.getByLabel(t.clientBlacklistReasonLabel).selectOption("no_access");
  await page.getByRole("textbox", { name: t.clientBlacklistCommentPlaceholder }).fill("Nie otworzył");
  await page.getByRole("button", { name: t.clientBlacklistConfirm }).click();

  const warning = page.getByRole("alert").filter({ hasText: t.clientOnBlacklist });
  await expect(warning).toContainText(t.clientReasonNoAccess);
  expect(puts[0].body).toMatchObject({ phone: PHONE, blocked: true, reason: "no_access", comment: "Nie otworzył" });

  await page.getByRole("button", { name: t.clientBlacklistRemove }).click();
  await expect(page.getByRole("alert").filter({ hasText: t.clientOnBlacklist })).toHaveCount(0);
  expect(puts[1].body).toMatchObject({ phone: PHONE, blocked: false });
});

test("the order window warns about a blacklisted client and shows the note", async ({ page }) => {
  const booking = cabinetBooking({
    client_blacklisted: true,
    client_blacklist_reason: "no_payment",
    client_blacklist_comment: "Nie zapłacił za montaż",
    client_note: "Pies w domu",
  });
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, { bookings: [booking] });
  await page.goto("/cabinet/");

  await page.getByText(booking.client_name, { exact: false }).click();

  await expect(page.getByText(t.clientWarningInOrder)).toBeVisible();
  await expect(page.getByText(t.clientReasonNoPayment)).toBeVisible();
  await expect(page.getByText("«Nie zapłacił za montaż»")).toBeVisible();
  await expect(page.getByText("Pies w domu")).toBeVisible();
});

test("a worker without the client-cards permission has no «Klienci» tab", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true, role: "worker", permissions: ["calendar_view", "bookings_status"] });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});
  await page.goto("/cabinet/");

  await expect(page.getByRole("tab", { name: t.calendarTitle })).toBeVisible();
  await expect(page.getByRole("tab", { name: t.tabClients })).toHaveCount(0);
});
