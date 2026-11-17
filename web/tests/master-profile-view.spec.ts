import { expect, test } from "./fixtures";
import { mockCatalog, PROVIDER, SERVICE, t } from "./mocks";

// «O mistrzu i opinie» (tester 17.11.2026: you could only call the master)
test("the client opens a master's profile with «about» and reviews, then picks him", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCatalog(page);
  await page.route(/\/api\/providers(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ ...PROVIDER, about: "15 lat doświadczenia, własne narzędzia." }]),
    }),
  );
  await page.route("**/api/providers/*/reviews", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "r1", provider_id: PROVIDER.id, client_name: "Jan Kowalski", rating: 5, text: "Szybko i czysto.", photos: [], created_at: "2026-11-10T12:00:00Z" },
      ]),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: t.masterProfileButton }).click();

  const dialog = page.getByRole("dialog", { name: PROVIDER.name });
  await expect(dialog).toContainText("15 lat doświadczenia, własne narzędzia.");
  await expect(dialog).toContainText("Szybko i czysto.");
  await expect(dialog).toContainText("Jan K."); // not the full surname
  await expect(dialog).not.toContainText("Kowalski");
  await page.screenshot({ path: "C:/Users/HP/AppData/Local/Temp/claude/baee8684579f94b3/91b9d509-9297-4314-bc97-a1f02c9cbc04/scratchpad/profile.png" });

  await dialog.getByRole("button", { name: t.chooseMasterButton }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: SERVICE.name })).toBeVisible();
});
