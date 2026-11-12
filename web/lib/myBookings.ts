/**
 * Ссылки клиента на его заказы, запомненные на этом устройстве. Без них
 * клиент, ушедший с экрана заказа на главную, не мог туда вернуться (только
 * через SMS). Пишем при создании заказа и при открытии /booking по ссылке;
 * главная показывает ближайший активный заказ (components/MyBookingCard).
 * localStorage может быть недоступен — тогда просто ничего не помним.
 */

const KEY = "zr_my_bookings";
const MAX = 5;

export interface SavedBooking {
  id: string;
  token: string;
}

export function savedBookings(): SavedBooking[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter(
          (b): b is SavedBooking =>
            typeof b?.id === "string" && typeof b?.token === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function write(list: SavedBooking[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* приватный режим — не помним */
  }
}

export function rememberBooking(id: string, token: string) {
  write([{ id, token }, ...savedBookings().filter((b) => b.id !== id)]);
}

export function forgetBooking(id: string) {
  write(savedBookings().filter((b) => b.id !== id));
}

export function bookingUrl(b: SavedBooking): string {
  return `/booking/?id=${b.id}&token=${encodeURIComponent(b.token)}`;
}
