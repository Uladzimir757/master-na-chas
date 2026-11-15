"use client";

/**
 * «Zdjęcie profilowe» в настройках кабинета (решение 15.11.2026): мастер
 * выбирает фото, телефон сам обрезает его до квадрата и сжимает до 256 px
 * JPEG (~20–40 КБ), на сервер уходит уже маленькая картинка. Без фото в
 * списке мастеров — цветные инициалы, как раньше.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import MasterAvatar from "@/components/MasterAvatar";
import { CompactButton } from "@/components/ui";

const SIZE = 256;

function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas_unsupported"));
        // centre crop to a square, then scale down
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function MyAvatar() {
  const { t } = useLocale();
  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null | undefined>(undefined); // undefined = no change
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getMySettings()
      .then((s) => {
        setName(s.name);
        setSaved(s.avatar ?? null);
      })
      .catch(() => setName(""));
  }, []);

  if (name === null) return null;
  const shown = draft === undefined ? saved : draft;

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setMessage(null);
    try {
      setDraft(await toSquareJpeg(file));
    } catch {
      setMessage({ ok: false, text: t.myAvatarError });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    if (draft === undefined) return;
    setBusy(true);
    setMessage(null);
    try {
      const s = await api.updateMyAvatar(draft);
      setSaved(s.avatar ?? null);
      setDraft(undefined);
      setMessage({ ok: true, text: t.myPhoneSaved });
    } catch {
      setMessage({ ok: false, text: t.myAvatarError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-ink-2">{t.myAvatarTitle}</h2>
      <div className="mb-3 flex items-center gap-3">
        <MasterAvatar name={name} photo={shown} />
        <div className="flex flex-wrap gap-2">
          <CompactButton type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {t.myAvatarChoose}
          </CompactButton>
          {shown && (
            <CompactButton type="button" variant="secondary" disabled={busy} onClick={() => setDraft(null)}>
              {t.myAvatarRemove}
            </CompactButton>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files)} />
      </div>
      <div className="flex items-center gap-3">
        <CompactButton type="button" disabled={busy || draft === undefined} onClick={save}>
          {t.settingsSave}
        </CompactButton>
        {message && (
          <span className={`text-sm ${message.ok ? "text-ink-2" : "text-danger"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
