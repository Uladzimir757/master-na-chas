import { formatTime } from "../lib/format";
import { expect, test } from "./fixtures";
import {
  bookingResponse,
  cabinetBooking,
  mockAuthMe,
  mockAvailability,
  mockCatalog,
  mockCreateBooking,
  mockMyCalendar,
  mockMyServices,
  mockProviderSettings,
  serviceToggle,
  SLOT_A,
  t,
} from "./mocks";

// Voice input for clients (20.11.2026, components/VoiceButton.tsx). The
// browser's speech recognition is faked: it «hears» one phrase.
const fakeSpeech = (phrase: string) => {
  class FakeRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    start() {
      (window as unknown as { __lang: string }).__lang = this.lang;
      setTimeout(() => {
        this.onresult?.({ results: [[{ transcript: phrase }]] });
        this.onend?.();
      }, 50);
    }
    stop() {
      this.onend?.();
    }
  }
  // newer Chromium has the unprefixed one too, and the code prefers it
  const w = window as unknown as Record<string, unknown>;
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;
};

test("the client dictates the job description and it goes with the booking", async ({ page }) => {
  await page.addInitScript(fakeSpeech, "Cieknie kran w kuchni");
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/bookings", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(bookingResponse("pending")) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();

  const notes = page.getByRole("textbox", { name: t.bookingNotesPlaceholder });
  await notes.fill("Mam część.");
  await page.getByRole("button", { name: t.voiceStart }).first().click();
  await expect(notes).toHaveValue("Mam część. Cieknie kran w kuchni"); // appended, not replaced
  // the page's language, not the phone's (fixture locale is Polish)
  expect(await page.evaluate(() => (window as unknown as { __lang: string }).__lang)).toBe("pl-PL");

  await page.getByPlaceholder(t.namePlaceholder).fill("Iwan");
  await page.getByPlaceholder(t.phonePlaceholder).fill("+48123456789");
  await page.getByRole("button", { name: t.submitBooking }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].notes).toBe("Mam część. Cieknie kran w kuchni");
});

test("no speech recognition in the browser — no microphone button", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await mockCatalog(page);
  await mockAvailability(page, [SLOT_A]);
  await mockCreateBooking(page, () => ({ status: 201, body: bookingResponse("pending") }));
  await page.goto("/");
  await page.getByRole("button", { name: t.chooseMasterButton }).click();
  await page.getByRole("button", { name: new RegExp(formatTime(SLOT_A.start_at, "pl")) }).click();
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
