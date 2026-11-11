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

/** Итог последней попытки включить пуши — для строки статуса в кабинете. */
export type PushStatus =
  | { state: "registered" }
  | { state: "denied" }
  | { state: "unavailable" }
  | { state: "error"; message: string };

/**
 * Спрашивает разрешение на уведомления, получает FCM-токен и привязывает
 * его к мастеру (по входу) или к телефону клиента (по ссылке «моя запись»).
 * Best-effort: отказ в разрешении, нет Firebase-конфига в сборке или сеть —
 * сайт работает как раньше, а причина возвращается статусом (его показывает
 * блок «Уведомления на этом телефоне» в кабинете, components/PushStatus.tsx).
 */
export async function registerNativePush(owner: PushOwner): Promise<PushStatus> {
  const p = platform();
  if (!isNativeApp() || !p) return { state: "unavailable" };
  let step = "plugin";
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    step = "permission";
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return { state: "denied" };
    step = "token";
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return { state: "error", message: "token: empty" };
    step = "server";
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
    return { state: "registered" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: "error", message: `${step}: ${message}` };
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

/** Ссылка из data.url пуша — только свой сайт, внешние адреса игнорируются. */
export function openPushUrl(url: unknown): void {
  if (typeof url !== "string") return;
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) {
      window.location.href = target.pathname + target.search + target.hash;
    }
  } catch {
    /* битый url — остаёмся где были */
  }
}

/**
 * Тап по уведомлению открывает его data.url (сервер кладёт туда ссылку
 * «моя запись» клиенту и /cabinet/?booking=<id> мастеру).
 */
export async function installPushTapHandler(): Promise<void> {
  if (!isNativeApp() || tapHandlerInstalled) return;
  tapHandlerInstalled = true;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const data = event.notification.data as { url?: unknown } | undefined;
      openPushUrl(data?.url);
    });
  } catch {
    tapHandlerInstalled = false;
  }
}

export interface ForegroundPush {
  title: string;
  body: string;
  url: string | null;
}

/**
 * Пуш, пришедший при открытом приложении: Android его не показывает, он
 * приходит только сюда — components/PushBanner.tsx рисует баннер. Возвращает
 * функцию отписки.
 */
export async function onForegroundPush(cb: (push: ForegroundPush) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const handle = await FirebaseMessaging.addListener("notificationReceived", (event) => {
      const n = event.notification;
      const data = n.data as { url?: unknown } | undefined;
      cb({
        title: n.title ?? "",
        body: n.body ?? "",
        url: typeof data?.url === "string" ? data.url : null,
      });
    });
    return () => void handle.remove();
  } catch {
    return () => {};
  }
}
