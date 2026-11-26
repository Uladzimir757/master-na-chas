import { expect, test } from "./fixtures";
import { mockAuthMe, mockCatalog, mockMyCalendar, mockMyServices, mockProviderSettings, serviceToggle, t } from "./mocks";

test("страницы регламента и политики открываются и содержат текст", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/regulamin/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Operator").first()).toBeVisible();
  await expect(page.getByRole("link", { name: t.legalBack })).toBeVisible();
  await page.goto("/polityka-prywatnosci/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("на главной есть ссылки на регламент и политику", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: t.footerTerms })).toHaveAttribute("href", "/regulamin/");
  await expect(page.getByRole("link", { name: t.footerPrivacy })).toHaveAttribute("href", "/polityka-prywatnosci/");
});

test("мастер без принятого регламента видит экран согласия и после него — кабинет", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ master_user_id: "m1", name: null, role: "owner", permissions: [], terms_accepted: false }),
    }),
  );
  let accepted = false;
  await page.route("**/auth/accept-terms", (route) => {
    accepted = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  await mockMyCalendar(page, {});

  await page.goto("/cabinet/");
  await expect(page.getByRole("heading", { name: t.masterTermsTitle })).toBeVisible();
  const go = page.getByRole("button", { name: t.masterTermsContinue });
  await expect(go).toBeDisabled();
  await page.getByRole("checkbox").check();
  await go.click();
  await expect(page.getByRole("heading", { name: t.masterTermsTitle })).toHaveCount(0);
  expect(accepted).toBe(true);
});
