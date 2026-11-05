/**
 * Приложение одно на мастера и клиента. Если на устройстве сохранён вход
 * мастера, при запуске открываем сразу кабинет, а не главную для клиента
 * (docs/app-auto-open-cabinet-task.md). Токен проверяет уже сам кабинет:
 * недействительный он сбрасывает (api.me) и показывает форму входа.
 *
 * Только один раз за запуск: sessionStorage живёт, пока жив процесс
 * приложения / вкладка, так что мастер, сам вернувшийся на главную, туда и
 * попадёт, а при следующем запуске снова откроется кабинет.
 */

import { getToken } from "@/lib/authToken";

const DONE_KEY = "zr_auto_cabinet_done";

export function shouldAutoOpenCabinet(): boolean {
  try {
    if (window.sessionStorage.getItem(DONE_KEY)) return false;
    window.sessionStorage.setItem(DONE_KEY, "1");
  } catch {
    /* no sessionStorage — still fine to check the token */
  }
  return getToken("master") !== null;
}
