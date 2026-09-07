import { expect, test } from "./fixtures";
import {
  adminMaster,
  mockAdminLogin,
  mockAdminLogout,
  mockAdminMasters,
  mockAdminMe,
  mockTelegramLink,
  mockUpdateMasterRating,
} from "./mocks";

// /admin — the superadmin panel (app/admin/page.tsx). Separate session flag
// from the master cabinet (/cabinet); see app/main.py's require_admin.

test("shows the login form when there is no admin session, then the panel after logging in", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: false });
  await mockAdminLogin(page);
  await mockAdminMasters(page, []);

  await page.goto("/admin/");
  await expect(page.getByPlaceholder("Пароль администратора")).toBeVisible();

  await page.getByPlaceholder("Пароль администратора").fill("correct-secret");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("heading", { name: "Мастера", exact: true })).toBeVisible();
  await expect(page.getByText("Мастеров пока нет")).toBeVisible();
});

test("skips the login form when an admin session already exists", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, [adminMaster({ name: "Владимир", email: "v@example.com" })]);

  await page.goto("/admin/");

  await expect(page.getByText("Владимир")).toBeVisible();
  await expect(page.getByText("v@example.com")).toBeVisible();
});

test("shows an error for a wrong admin password", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: false });
  await mockAdminLogin(page, { status: 401 });

  await page.goto("/admin/");
  await page.getByPlaceholder("Пароль администратора").fill("wrong");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText("Неверный пароль")).toBeVisible();
});

test("the password field's peek toggle reveals and hides the typed value", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: false });

  await page.goto("/admin/");
  const passwordField = page.getByPlaceholder("Пароль администратора");
  await passwordField.fill("hunter2");
  await expect(passwordField).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Показать пароль" }).click();
  await expect(passwordField).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Скрыть пароль" }).click();
  await expect(passwordField).toHaveAttribute("type", "password");
});

test("creating a master adds it to the list without a page reload", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, []);

  await page.goto("/admin/");
  await expect(page.getByText("Мастеров пока нет")).toBeVisible();

  await page.getByPlaceholder("Имя (как будет видно клиентам)").fill("Друг");
  await page.getByPlaceholder("Email для входа в личный кабинет").fill("friend@example.com");
  await page.getByPlaceholder("Пароль (минимум 8 символов)").fill("password123");
  await page.getByRole("button", { name: "Создать мастера" }).click();

  await expect(page.getByText("Мастер создан.")).toBeVisible();
  await expect(page.getByText("Друг")).toBeVisible();
  await expect(page.getByText("friend@example.com")).toBeVisible();
  // The form resets after a successful create, ready for the next master.
  await expect(page.getByPlaceholder("Имя (как будет видно клиентам)")).toHaveValue("");
});

test("a duplicate email surfaces the backend's 409 as a specific message", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, [], { createStatus: 409 });

  await page.goto("/admin/");
  await page.getByPlaceholder("Имя (как будет видно клиентам)").fill("Друг");
  await page.getByPlaceholder("Email для входа в личный кабинет").fill("dup@example.com");
  await page.getByPlaceholder("Пароль (минимум 8 символов)").fill("password123");
  await page.getByRole("button", { name: "Создать мастера" }).click();

  await expect(page.getByText("Мастер с таким email уже существует")).toBeVisible();
});

test("getting a Telegram link for an unlinked master shows an openable link", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, [adminMaster({ telegram_linked: false })]);
  await mockTelegramLink(page);

  await page.goto("/admin/");
  await page.getByRole("button", { name: "получить ссылку" }).click();

  await expect(page.getByRole("link", { name: "открыть ссылку" })).toHaveAttribute(
    "href",
    "https://t.me/test_bot?start=mock-token",
  );
});

// Manual rating stand-in (PATCH /admin/masters/{id}) — see
// Provider.rating's docstring in app/models.py and AdminPanel.tsx.
test("setting a master's rating saves it on blur", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  const master = adminMaster({ rating: null, rating_count: 0 });
  await mockAdminMasters(page, [master]);
  await mockUpdateMasterRating(page, master);

  await page.goto("/admin/");
  const ratingInput = page.getByLabel(`Рейтинг — ${master.name}`);
  await ratingInput.fill("4.5");
  await ratingInput.blur();

  await expect(page.getByLabel(`Рейтинг — ${master.name}`)).toHaveValue("4.5");
});

test("a failed rating save shows an error message", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  const master = adminMaster({ rating: null, rating_count: 0 });
  await mockAdminMasters(page, [master]);
  await mockUpdateMasterRating(page, master, { status: 500 });

  await page.goto("/admin/");
  const ratingInput = page.getByLabel(`Рейтинг — ${master.name}`);
  await ratingInput.fill("4.5");
  await ratingInput.blur();

  await expect(page.getByText("Не удалось сохранить оценку")).toBeVisible();
});

test("logging out returns to the login form", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, []);
  await mockAdminLogout(page);

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Выйти" }).click();

  await expect(page.getByPlaceholder("Пароль администратора")).toBeVisible();
});
