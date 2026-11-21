import type { Page } from "@playwright/test";
import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import { mockAvailability, mockCatalog, PROVIDER, providerServiceOffering, SLOT_A, t } from "./mocks";

// «Co trzeba zrobić?» on the home page (21.11.2026): the job in the client's
// own words → /api/task-match (a language model picks the services) → only
// the masters doing it. Before, the field matched master names only, and
// «powiesić półkę» showed an empty list with nothing to press.

const SHELF = providerServiceOffering({ id: "a1a1a1a1-0000-0000-0000-000000000001", name: "Montaż półki/lustra" });
const SOCKET = providerServiceOffering({ id: "a1a1a1a1-0000-0000-0000-000000000002", name: "Wymiana gniazdka/włącznika" });
const PAINT = providerServiceOffering({ id: "a1a1a1a1-0000-0000-0000-000000000003", name: "Malowanie ściany" });
const SHELF_MASTER = { ...PROVIDER, id: "b1b1b1b1-0000-0000-0000-000000000001", name: "Andrzej" };
const SOCKET_MASTER = { ...PROVIDER, id: "b1b1b1b1-0000-0000-0000-000000000002", name: "Marek" };

async function setup(page: Page, answer: { status?: number; body?: unknown } = {}) {
  await mockCatalog(page, {
    providers: [SHELF_MASTER, SOCKET_MASTER],
    providerServices: { [SHELF_MASTER.id]: [PAINT, SHELF], [SOCKET_MASTER.id]: [SOCKET] },
  });
  await mockAvailability(page, [SLOT_A]);
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/task-match", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({
      status: answer.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        answer.body ?? { by: "task", services: [{ id: SHELF.id, name: SHELF.name }], provider_ids: [SHELF_MASTER.id] },
      ),
    });
  });
  await page.goto("/");
  return asked;
}

const field = (page: Page) => page.getByRole("searchbox", { name: t.taskSearchPlaceholder });
const card = (page: Page, name: string) => page.locator("div.rounded-2xl", { hasText: name });

test("a job in own words finds the master doing it, and the text goes on into the order", async ({ page }) => {
  const asked = await setup(page);

  await field(page).fill("Powiesić półkę w łazience");
  // a job description doesn't empty the list while typing
  await expect(card(page, "Marek")).toBeVisible();
  expect(asked).toEqual([]);

  await page.getByRole("button", { name: t.taskSearchButton }).click();
  await expect(page.getByText(t.taskFound(SHELF.name))).toBeVisible();
  expect(asked).toEqual([{ text: "Powiesić półkę w łazience", city: "gdynia", lang: "pl" }]);
  await expect(card(page, "Andrzej")).toBeVisible();
  await expect(card(page, "Marek")).toHaveCount(0);

  // the fitting service is first and marked
  await card(page, "Andrzej").getByRole("button", { name: t.chooseMasterButton }).click();
  const services = page.locator("button", { hasText: /Montaż półki|Malowanie/ });
  await expect(services.first()).toContainText(SHELF.name);
  await expect(services.first()).toContainText(t.taskServiceFits);
  await expect(services.nth(1)).not.toContainText(t.taskServiceFits);

  // and the client doesn't have to describe it again
  await services.first().click();
  await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
  await expect(page.getByRole("textbox", { name: t.bookingNotesPlaceholder })).toHaveValue("Powiesić półkę w łazience");
});

test("«show all» brings every master back and forgets the job", async ({ page }) => {
  await setup(page);
  await field(page).fill("półka");
  await field(page).press("Enter");
  await expect(card(page, "Marek")).toHaveCount(0);
  await page.getByRole("button", { name: t.taskShowAll }).click();
  await expect(field(page)).toHaveValue("");
  await expect(card(page, "Marek")).toBeVisible();
  await expect(card(page, "Andrzej")).toBeVisible();
});

test("nothing fits: said plainly, every master stays", async ({ page }) => {
  await setup(page, { body: { by: "none", services: [], provider_ids: [] } });
  await field(page).fill("zrobić pizzę");
  await page.getByRole("button", { name: t.taskSearchButton }).click();
  await expect(page.getByText(t.taskNone)).toBeVisible();
  await expect(card(page, "Marek")).toBeVisible();
  await expect(card(page, "Andrzej")).toBeVisible();
});

test("search down: said plainly, every master stays", async ({ page }) => {
  await setup(page, { status: 503, body: { detail: "x" } });
  await field(page).fill("powiesić półkę");
  await page.getByRole("button", { name: t.taskSearchButton }).click();
  await expect(page.getByText(t.taskError)).toBeVisible();
  await expect(card(page, "Marek")).toBeVisible();
});

test("a master's name still narrows the list while typing", async ({ page }) => {
  await setup(page);
  await field(page).fill("mar");
  await expect(card(page, "Marek")).toBeVisible();
  await expect(card(page, "Andrzej")).toHaveCount(0);
});
