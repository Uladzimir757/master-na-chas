/**
 * Нативное приложение (Capacitor, docs/mobile-app-task.md). Сайт один и тот
 * же: в браузере эти функции ничего не делают, в приложении WebView грузит
 * его же с server.url, и Capacitor добавляет мост к нативным плагинам.
 * Плагины импортируются динамически — в обычный веб-бандл их код не попадает
 * до первого вызова из приложения.
 */

import { Capacitor } from "@capacitor/core";
import { api } from "@/lib/api";

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function platform(): "android" | "ios" | null {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : null;
}

// Последний зарегистрированный FCM-токен — чтобы отписать устройство при
// выходе мастера из кабинета.
const FCM_TOKEN_KEY = "zr_fcm_token";

export type PushOwner =
  | { kind: "master" }
  | { kind: "client"; bookingId: string; token: string };

/**
 * Спрашивает разрешение на уведомления, получает FCM-токен и привязывает
 * его к мастеру (по входу) или к телефону клиента (по ссылке «моя запись»).
 * Best-effort: отказ в разрешении, нет Firebase-конфига в сборке или сеть —
 * молча ничего, сайт работает как раньше.
 */
export async function registerNativePush(owner: PushOwner): Promise<void> {
  const p = platform();
  if (!isNativeApp() || !p) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return;
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return;
    if (owner.kind === "master") {
      await api.registerDeviceToken(token, p);
    } else {
      await api.registerClientDeviceToken(owner.bookingId, owner.token, token, p);
    }
    try {
      window.localStorage.setItem(FCM_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  } catch {
    /* best-effort, см. docstring */
  }
}

/** Выход мастера: устройство больше не должно получать его уведомления. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(FCM_TOKEN_KEY);
    window.localStorage.removeItem(FCM_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (token) await api.unregisterDeviceToken(token).catch(() => {});
}

let tapHandlerInstalled = false;

/**
 * Тап по уведомлению открывает его data.url (сервер кладёт туда ссылку
 * «моя запись» клиенту и /cabinet/ мастеру). Только свой сайт — внешние
 * адреса игнорируются.
 */
export async function installPushTapHandler(): Promise<void> {
  if (!isNativeApp() || tapHandlerInstalled) return;
  tapHandlerInstalled = true;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const data = event.notification.data as { url?: unknown } | undefined;
      if (typeof data?.url !== "string") return;
      try {
        const target = new URL(data.url, window.location.origin);
        if (target.origin === window.location.origin) {
          window.location.href = target.pathname + target.search + target.hash;
        }
      } catch {
        /* битый url — просто открыть приложение */
      }
    });
  } catch {
    tapHandlerInstalled = false;
  }
}
