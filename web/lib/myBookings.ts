/**
 * Заказы клиента, запомненные на этом устройстве (id + ссылка-токен), и его
 * имя/телефон для формы. Без них клиент, ушедший с экрана заказа на главную,
 * не мог туда вернуться (только через SMS). Пишем при создании заказа и при
 * открытии /booking по ссылке; главная показывает активные заказы и, в
 * приложении, историю (components/MyBookingCard).
 *
 * Приложение «помнит всё» (решение пользователя 12.11.2026): заказы не
 * забываются после отмены/выполнения, имя и телефон подставляются в форму.
 * В браузере (может быть чужой компьютер) — только активные заказы и без
 * личных данных.
 *
 * localStorage может быть недоступен — тогда просто ничего не помним.
 */

import { isNativeApp } from "@/lib/native";

const KEY = "zr_my_bookings";
const CLIENT_KEY = "zr_client";
const MAX_BROWSER = 5;
const MAX_APP = 50;

export interface SavedBooking {
  id: string;
  token: string;
}

export interface SavedClient {
  name: string;
  phone: string;
}

/** В приложении заказы не забываются после отмены/выполнения. */
export function remembersEverything(): boolean {
  return isNativeApp();
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим — не помним */
  }
}

export function savedBookings(): SavedBooking[] {
  const list = read<unknown>(KEY);
  return Array.isArray(list)
    ? list.filter(
        (b): b is SavedBooking =>
          typeof b?.id === "string" && typeof b?.token === "string",
      )
    : [];
}

export function rememberBooking(id: string, token: string) {
  const max = remembersEverything() ? MAX_APP : MAX_BROWSER;
  write(KEY, [{ id, token }, ...savedBookings().filter((b) => b.id !== id)].slice(0, max));
}

/** Добавить в конец, не сдвигая уже известные (заказы, найденные по телефону). */
export function rememberBookingQuietly(id: string, token: string) {
  const list = savedBookings();
  if (list.some((b) => b.id === id)) return;
  const max = remembersEverything() ? MAX_APP : MAX_BROWSER;
  if (list.length >= max) return;
  write(KEY, [...list, { id, token }]);
}

export function forgetBooking(id: string) {
  write(KEY, savedBookings().filter((b) => b.id !== id));
}

export function bookingUrl(b: SavedBooking, action?: "reschedule"): string {
  return `/booking/?id=${b.id}&token=${encodeURIComponent(b.token)}${action ? `&do=${action}` : ""}`;
}

/** Имя и телефон клиента — только в приложении. */
export function savedClient(): SavedClient | null {
  if (!remembersEverything()) return null;
  const c = read<SavedClient>(CLIENT_KEY);
  return c && typeof c.name === "string" && typeof c.phone === "string" ? c : null;
}

export function rememberClient(name: string, phone: string) {
  if (!remembersEverything()) return;
  write(CLIENT_KEY, { name, phone });
}
