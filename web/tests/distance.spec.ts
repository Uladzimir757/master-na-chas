import { expect, test } from "./fixtures";
import { mockCatalog, PROVIDER, t } from "./mocks";

// «Distance to the master» (task 15.11.2026, part C): only on the client's
// explicit action, the point is rounded to ~100 m before it is sent, and the
// card shows what the server computed.
test("«show distance» sends a rounded point and shows the distance on the card", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 54.51234, longitude: 18.53987 });
  await mockCatalog(page);
  const seen: URL[] = [];
  await page.route(/\/api\/providers(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const withDistance = url.searchParams.has("lat") ? { distance_m: 2100 } : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ ...PROVIDER, ...withDistance }]),
    });
  });
  await page.goto("/");

  // nothing asked for or sent until the client presses the button
  await expect(page.getByRole("button", { name: t.showDistance })).toBeVisible();
  expect(seen.every((u) => !u.searchParams.has("lat"))).toBe(true);

  await page.getByRole("button", { name: t.showDistance }).click();
  await expect(page.getByText(t.distanceAway("2,1 km"))).toBeVisible();
  const withPoint = seen.find((u) => u.searchParams.has("lat"))!;
  expect(withPoint.searchParams.get("lat")).toBe("54.512");
  expect(withPoint.searchParams.get("lng")).toBe("18.54");

  // and it can be switched off again
  await page.getByRole("button", { name: t.hideDistance }).click();
  await expect(page.getByText(t.distanceAway("2,1 km"))).toHaveCount(0);
});
