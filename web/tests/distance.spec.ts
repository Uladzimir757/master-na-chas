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

test("without location the client types an address instead", async ({ page }) => {
  // no geolocation permission granted in this context
  await mockCatalog(page);
  const addresses: string[] = [];
  await page.route("**/api/geocode", async (route) => {
    addresses.push((route.request().postDataJSON() as { address: string }).address);
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"lat":54.519,"lng":18.531}' });
  });
  await page.route(/\/api\/providers(\?.*)?$/, (route) => {
    const has = new URL(route.request().url()).searchParams.has("lat");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ ...PROVIDER, ...(has ? { distance_m: 800 } : {}) }]),
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: t.addressInstead }).click();
  await page.getByPlaceholder(t.addressPlaceholder).fill("Morska 10, Gdynia");
  await page.getByRole("button", { name: t.addressCheck }).click();

  await expect(page.getByText(t.distanceAway("800 m"))).toBeVisible();
  expect(addresses).toEqual(["Morska 10, Gdynia"]);
  await expect(page.getByText(t.addressAttribution)).toHaveCount(0); // form closed after success
});

test("the master list stays on screen while it reloads with the distance", async ({ page, context }) => {
  // tester 17.11.2026: the list was swapped for «loading» on every toggle,
  // the page shrank and the visitor landed on the «Masz już zamówienie?»
  // phone field below — «show distance asks for a phone number»
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 54.51, longitude: 18.53 });
  await mockCatalog(page);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/providers(\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.has("lat")) await held; // slow reload
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([PROVIDER]) });
  });
  await page.goto("/");
  const card = page.getByText(PROVIDER.name).first();
  await expect(card).toBeVisible();

  await page.getByRole("button", { name: t.showDistance }).click();
  await expect(card).toBeVisible(); // still there mid-reload
  await expect(page.getByText(t.loading)).toHaveCount(0);
  release();
  await expect(page.getByText(t.distanceNoneHint)).toBeVisible(); // no master shares a point
});
