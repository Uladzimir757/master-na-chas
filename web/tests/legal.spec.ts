import { expect, test } from "./fixtures";
import { mockCatalog, t } from "./mocks";

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
