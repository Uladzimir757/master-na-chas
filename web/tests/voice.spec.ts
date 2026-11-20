import type { Page } from "@playwright/test";
import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import {
  bookingResponse,
  cabinetBooking,
  mockAuthMe,
  mockAvailability,
  mockCatalog,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  serviceToggle,
  SLOT_A,
  t,
} from "./mocks";

// Voice input (20.11.2026, the zlecai way): the page records with
// MediaRecorder, POSTs the audio to /api/transcribe and puts the text into
// the field — it never sends the form by itself. Microphone and server are
// faked here.

type MicMode = "ok" | "blocked";

const fakeMic = (mode: MicMode) => {
  const w = window as unknown as Record<string, unknown>;
  // navigator.mediaDevices is a read-only getter — plain assignment is ignored
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        if (mode === "blocked") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        return { getTracks: () => [{ stop() {} }] };
      },
    },
  });
  class FakeRecorder {
    static isTypeSupported(m: string) {
      return m.startsWith("audio/webm");
    }
    state = "inactive";
    mimeType = "audio/webm;codecs=opus";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  w.MediaRecorder = FakeRecorder;
};

async function openBookingForm(page: Page) {
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
}

test("record → server text → appended to the description; the client sends the form himself", async ({ page }) => {
  await page.addInitScript(fakeMic, "ok" as MicMode);
  const uploads: { type: string; size: number }[] = [];
  await page.route("**/api/transcribe", async (route) => {
    const req = route.request();
    uploads.push({ type: req.headers()["content-type"], size: (req.postDataBuffer() ?? Buffer.alloc(0)).length });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"text":"Cieknie kran w kuchni"}' });
  });
  const bookings: Record<string, unknown>[] = [];
  await page.route("**/api/bookings", async (route) => {
    bookings.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(bookingResponse("pending")) });
  });
  await openBookingForm(page);

  const notes = page.getByRole("textbox", { name: t.bookingNotesPlaceholder });
  await notes.fill("Mam część.");
  await page.getByRole("button", { name: t.voiceStart }).first().click();
  await expect(page.getByRole("button", { name: t.voiceStop })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: t.voiceStop }).click();

  await expect(notes).toHaveValue("Mam część. Cieknie kran w kuchni");
  expect(uploads).toEqual([{ type: "audio/webm;codecs=opus", size: 4000 }]); // the recorder's own type
  expect(bookings).toEqual([]); // nothing sent by itself

  await page.getByPlaceholder(t.namePlaceholder).fill("Iwan");
  await page.getByPlaceholder(t.phonePlaceholder).fill("+48123456789");
  await page.getByRole("button", { name: t.submitBooking }).click();
  await expect.poll(() => bookings.length).toBe(1);
  expect(bookings[0].notes).toBe("Mam część. Cieknie kran w kuchni");
});

test("nothing heard and server unavailable are said plainly", async ({ page }) => {
  await page.addInitScript(fakeMic, "ok" as MicMode);
  let answer = { status: 200, body: '{"text":""}' };
  await page.route("**/api/transcribe", (route) =>
    route.fulfill({ status: answer.status, contentType: "application/json", body: answer.body }),
  );
  await openBookingForm(page);
  const mic = () => page.getByRole("button", { name: t.voiceStart }).first();

  await mic().click();
  await page.getByRole("button", { name: t.voiceStop }).click();
  await expect(page.getByText(t.voiceNothing)).toBeVisible();

  answer = { status: 503, body: '{"detail":"x"}' };
  await mic().click();
  await page.getByRole("button", { name: t.voiceStop }).click();
  await expect(page.getByText(t.voiceFailed)).toBeVisible();
});

test("blocked microphone in a browser: steps shown, gone once allowed", async ({ page }) => {
  await page.addInitScript(fakeMic, "blocked" as MicMode);
  await page.addInitScript(() => {
    const status = new EventTarget() as EventTarget & { state: string };
    status.state = "denied";
    (window as unknown as { __micStatus: unknown }).__micStatus = status;
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => status },
    });
  });
  await openBookingForm(page);
  await page.getByRole("button", { name: t.voiceStart }).first().click();
  await expect(page.getByText(t.voiceBlockedBrowser)).toBeVisible();
  await expect(page.getByRole("button", { name: t.voiceOpenSettings })).toHaveCount(0); // not in the app

  await page.evaluate(() => {
    const s = (window as unknown as { __micStatus: EventTarget & { state: string } }).__micStatus;
    s.state = "granted";
    s.dispatchEvent(new Event("change"));
  });
  await expect(page.getByText(t.voiceBlockedBrowser)).toHaveCount(0);
});

test("no MediaRecorder — no microphone button", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).MediaRecorder;
  });
  await openBookingForm(page);
  await expect(page.getByRole("textbox", { name: t.bookingNotesPlaceholder })).toBeVisible();
  await expect(page.getByRole("button", { name: t.voiceStart })).toHaveCount(0);
});

test("the master sees the client's description in the booking window", async ({ page }) => {
  await mockAuthMe(page, { loggedIn: true });
  await mockMyServices(page, [serviceToggle()]);
  await mockProviderSettings(page);
  const booking = { ...cabinetBooking(), notes: "Cieknie kran w kuchni" };
  await mockMyCalendar(page, { bookings: [booking] });
  await page.goto("/cabinet/");
  await page.getByText(booking.client_name, { exact: false }).click();
  await expect(page.getByText(t.bookingNotesTitle)).toBeVisible();
  await expect(page.getByText("Cieknie kran w kuchni")).toBeVisible();
});
