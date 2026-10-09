import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";

// public/sw.js — стратегии кэша. Воркер грузится в vm с подменёнными caches/
// fetch, без браузера: проверяем именно логику выбора «сеть или кэш».

const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://app.test";

type FakeRequest = { method: string; url: string; mode: string };
type Network = (request: FakeRequest) => Promise<Response>;
type Handler = (event: {
  request?: FakeRequest;
  respondWith?: (response: Promise<Response>) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => void;

const req = (path: string, init: Partial<FakeRequest> = {}): FakeRequest => ({
  method: "GET",
  url: new URL(path, ORIGIN).href,
  mode: "no-cors",
  ...init,
});
const nav = (path: string) => req(path, { mode: "navigate" });

function loadWorker(initialNetwork: Network) {
  let network = initialNetwork;
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const keyOf = (r: FakeRequest | string) =>
    typeof r === "string" ? new URL(r, ORIGIN).href : r.url;

  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(r: FakeRequest | string) {
          return store.get(keyOf(r))?.clone();
        },
        async put(r: FakeRequest, response: Response) {
          store.set(keyOf(r), response);
        },
        async addAll(urls: string[]) {
          for (const u of urls) store.set(keyOf(u), await network(req(u)));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };

  const context = vm.createContext({
    self: {
      addEventListener: (type: string, h: Handler) => {
        handlers[type] = h;
      },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
      location: { origin: ORIGIN },
    },
    caches,
    fetch: async (r: FakeRequest) => {
      fetched.push(r.url);
      return network(r);
    },
    Response,
    URL,
  });
  vm.runInContext(SW_SOURCE, context);

  return {
    stores,
    fetched,
    setNetwork(n: Network) {
      network = n;
    },
    async fetchEvent(request: FakeRequest): Promise<Response | "ignored"> {
      let responded: Promise<Response> | null = null;
      handlers.fetch({
        request,
        respondWith: (p) => {
          responded = Promise.resolve(p);
        },
      });
      return responded ? await responded : "ignored";
    },
    async lifecycle(type: "install" | "activate") {
      let pending: Promise<unknown> = Promise.resolve();
      handlers[type]({ waitUntil: (p) => (pending = p) });
      await pending;
    },
  };
}

const page =
  (body: string): Network =>
  async () =>
    new Response(body);
const offline: Network = async () => {
  throw new TypeError("Failed to fetch");
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = async (r: Response | "ignored") =>
  r === "ignored" ? r : r.text();

test("a page request gets the fresh page from the network, not the cached older one", async () => {
  const sw = loadWorker(page("v1"));
  expect(await text(await sw.fetchEvent(nav("/cabinet/")))).toBe("v1");

  sw.setNetwork(page("v2"));

  expect(await text(await sw.fetchEvent(nav("/cabinet/")))).toBe("v2");
});

test("a page request falls back to the cached copy when offline", async () => {
  const sw = loadWorker(page("v1"));
  await sw.fetchEvent(nav("/cabinet/"));

  sw.setNetwork(offline);

  expect(await text(await sw.fetchEvent(nav("/cabinet/")))).toBe("v1");
});

test("an uncached page offline falls back to the cached home page", async () => {
  const sw = loadWorker(page("home"));
  await sw.fetchEvent(nav("/"));

  sw.setNetwork(offline);

  expect(await text(await sw.fetchEvent(nav("/never-visited/")))).toBe("home");
});

test("content-hashed Next assets are served from the cache without asking the network", async () => {
  const sw = loadWorker(page("chunk"));
  await sw.fetchEvent(req("/_next/static/chunks/abc.js"));
  expect(sw.fetched).toHaveLength(1);

  sw.setNetwork(page("changed"));

  expect(
    await text(await sw.fetchEvent(req("/_next/static/chunks/abc.js"))),
  ).toBe("chunk");
  expect(sw.fetched).toHaveLength(1);
});

test("other same-origin files are served stale and refreshed in the background", async () => {
  const sw = loadWorker(page("icon-v1"));
  await sw.fetchEvent(req("/icons/icon-192.png"));

  sw.setNetwork(page("icon-v2"));

  expect(await text(await sw.fetchEvent(req("/icons/icon-192.png")))).toBe(
    "icon-v1",
  );
  await tick();
  expect(await text(await sw.fetchEvent(req("/icons/icon-192.png")))).toBe(
    "icon-v2",
  );
});

test("cross-origin requests and non-GET requests are never intercepted", async () => {
  const sw = loadWorker(page("x"));

  expect(
    await sw.fetchEvent({
      method: "GET",
      url: "https://api.other/api/bookings",
      mode: "cors",
    }),
  ).toBe("ignored");
  expect(await sw.fetchEvent(req("/api/bookings", { method: "POST" }))).toBe(
    "ignored",
  );
  expect(sw.fetched).toHaveLength(0);
});

test("activating drops caches left by an older worker version", async () => {
  const sw = loadWorker(page("x"));
  await sw.lifecycle("install");
  const [current] = [...sw.stores.keys()];
  sw.stores.set("zr-v1", new Map());

  await sw.lifecycle("activate");

  expect([...sw.stores.keys()]).toEqual([current]);
  expect(current).not.toBe("zr-v1");
});
