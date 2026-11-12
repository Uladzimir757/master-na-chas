/**
 * Проверка телефона — та же логика, что на сервере (app/phone.py): польский
 * номер из 9 цифр (первая не 0) с +48/0048 или без кода, либо иностранный
 * «+»/«00» и 8–15 цифр. Пробелы, дефисы, скобки и точки не считаются.
 * Возвращает E.164 («+48600111222»), null для пустого, undefined — неверный.
 */
export function normalizePhone(raw: string): string | null | undefined {
  let s = raw.replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const d = s.slice(1);
    if (!/^\d+$/.test(d)) return undefined;
    if (d.startsWith("48")) {
      const local = d.slice(2);
      return local.length === 9 && local[0] !== "0" ? "+" + d : undefined;
    }
    return d.length >= 8 && d.length <= 15 && d[0] !== "0" ? "+" + d : undefined;
  }
  return /^\d{9}$/.test(s) && s[0] !== "0" ? "+48" + s : undefined;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== undefined;
}
