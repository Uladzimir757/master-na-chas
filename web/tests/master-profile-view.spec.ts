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

// 1x1 PNGs in two colours — enough to tell the photos apart
const RED = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const BLUE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";

test("phone and «about & reviews» sit on separate lines on the card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockCatalog(page);
  await page.route(/\/api\/providers(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...PROVIDER, phone: "+48777333111" }]) }),
  );
  await page.goto("/");
  const phone = await page.getByRole("link", { name: "+48777333111" }).boundingBox();
  const about = await page.getByRole("button", { name: t.masterProfileButton }).boundingBox();
  expect(about!.y).toBeGreaterThan(phone!.y + phone!.height - 1);
});

test("a review photo opens full screen, flips to the next one and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCatalog(page);
  await page.route("**/api/providers/*/reviews", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "r1", provider_id: PROVIDER.id, client_name: "Jan Kowalski", rating: 5, text: "Ok", photos: [RED, BLUE], created_at: "2026-11-10T12:00:00Z" },
      ]),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: t.masterProfileButton }).click();
  await page.getByRole("button", { name: t.reviewPhotoOpen }).first().click();

  const viewer = page.getByRole("dialog", { name: t.reviewPhotoOpen });
  await expect(viewer.locator("img")).toHaveAttribute("src", RED);
  await expect(viewer).toContainText("1 / 2");
  await viewer.getByRole("button", { name: t.reviewPhotoNext }).click();
  await expect(viewer.locator("img")).toHaveAttribute("src", BLUE);
  await viewer.getByRole("button", { name: t.masterProfileClose }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: PROVIDER.name })).toBeVisible(); // back in the profile
});
