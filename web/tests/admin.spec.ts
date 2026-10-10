import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  adminMaster,
  mockAdminAnalytics,
  mockAdminLogin,
  mockAdminLogout,
  mockAdminMasters,
  mockAdminMe,
  mockDeleteMaster,
  mockTelegramLink,
  mockUpdateMasterRating,
} from "./mocks";

// имя мастера есть и в карточке, и в выпадающем списке «Аналитики» — берём карточку (она выше)
const masterName = (page: Page, name: string) => page.getByText(name, { exact: true }).first();

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

  await expect(masterName(page, "Владимир")).toBeVisible();
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
  await expect(masterName(page, "Друг")).toBeVisible();
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

// DELETE /admin/masters/{id} — a second click confirms, matching the rest
// of the site not using window.confirm (see AdminPanel.tsx).
test("deleting a master requires a confirm click, then removes it from the list", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  const master = adminMaster({ name: "Друг", email: "friend@example.com" });
  await mockAdminMasters(page, [master]);
  await mockDeleteMaster(page, master);

  await page.goto("/admin/");
  await expect(masterName(page, "Друг")).toBeVisible();

  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByRole("button", { name: "Да, удалить" })).toBeVisible();

  await page.getByRole("button", { name: "Да, удалить" }).click();

  await expect(masterName(page, "Друг")).toHaveCount(0);
  await expect(page.getByText("Мастеров пока нет")).toBeVisible();
});

test("clicking away from the delete confirmation cancels it", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  const master = adminMaster({ name: "Друг" });
  await mockAdminMasters(page, [master]);
  await mockDeleteMaster(page, master);

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Отмена" }).click();

  await expect(page.getByRole("button", { name: "Удалить" })).toBeVisible();
  await expect(masterName(page, "Друг")).toBeVisible();
});

test("a master with existing bookings can't be deleted — shows the backend's 409 as a message", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  const master = adminMaster({ name: "Владимир" });
  await mockAdminMasters(page, [master]);
  await mockDeleteMaster(page, master, { status: 409 });

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Да, удалить" }).click();

  await expect(page.getByText("есть бронирования")).toBeVisible();
  // мастера показаны карточками (раньше — таблица): имя осталось в списке
  await expect(masterName(page, "Владимир")).toBeVisible();
});

test("logging out returns to the login form", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, []);
  await mockAdminLogout(page);

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Выйти" }).click();

  await expect(page.getByPlaceholder("Пароль администратора")).toBeVisible();
});

// GET /admin/analytics — блок «Аналитика»: сводка по мастерам и по работам.
test("the analytics block shows per-master and per-service numbers", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, [adminMaster({ name: "Владимир" })]);
  await mockAdminAnalytics(page, {
    masters: [
      {
        provider_id: "p1",
        name: "Владимир",
        completed: 7,
        cancelled: 1,
        no_show: 0,
        total_minutes: 420,
        revenue: "350.00",
        priced_jobs: 5,
        avg_price: "70.00",
      },
    ],
    services: [
      {
        service_id: "s1",
        name: "Сборка шкафа",
        completed: 7,
        cancelled: 1,
        no_show: 0,
        total_minutes: 420,
        avg_minutes: 60,
        revenue: "350.00",
        priced_jobs: 5,
        avg_price: "70.00",
      },
    ],
  });

  await page.goto("/admin/");

  await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По мастерам" })).toBeVisible();
  await expect(page.getByText("Сборка шкафа")).toBeVisible();
  await expect(page.getByText("Выполнено:")).toContainText("7");
});

test("a failed analytics request shows an error, the rest of the panel still works", async ({ page }) => {
  await mockAdminMe(page, { isAdmin: true });
  await mockAdminMasters(page, [adminMaster({ name: "Владимир" })]);
  await mockAdminAnalytics(page, { masters: [], services: [] }, { status: 500 });

  await page.goto("/admin/");

  await expect(page.getByText("Не удалось загрузить аналитику")).toBeVisible();
  await expect(masterName(page, "Владимир")).toBeVisible();
});
