/**
 * Приложение одно на мастера и клиента. Если на устройстве сохранён вход
 * мастера, при открытии сразу показываем кабинет, а не главную для клиента
 * (docs/app-auto-open-cabinet-task.md). Токен проверяет уже сам кабинет:
 * недействительный он сбрасывает (api.me) и показывает форму входа.
 *
 * Только когда сам документ загрузился на главной (свежий запуск, тап по
 * уведомлению, обновление страницы) — и только один раз за загрузку.
 * Флаг в памяти модуля, а не в sessionStorage: фоновая геолокация держит
 * процесс приложения живым, и sessionStorage переживал перезапуск окна.
 * Переход на главную по ссылке изнутри сайта — клиентская навигация: если
 * документ грузился не на главной (например, приложение открылось прямо в
 * кабинете), обратно в кабинет не бросаем.
 */

import { getToken } from "@/lib/authToken";

let decided = false;

function documentLoadedAtHome(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const url = new URL(nav?.name ?? window.location.href);
    return url.pathname === "/" || url.pathname === "";
  } catch {
    return true;
  }
}

export function shouldAutoOpenCabinet(): boolean {
  if (decided) return false;
  decided = true;
  return documentLoadedAtHome() && getToken("master") !== null;
}
