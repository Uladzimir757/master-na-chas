"use client";

/**
 * Microphone button for client text fields (decision 20.11.2026, the zlecai
 * way): record on the device (lib/voice.ts) → POST /api/transcribe → OpenAI
 * → the text is appended to the field. It is never sent by itself: the client
 * checks it and presses the form's own button. Shown only where recording is
 * possible (checked after mount, so server and client render the same).
 *
 * How it's pressed (user's decision 21.11.2026 — a request is short, and a
 * recording left on picks up noise and other voices):
 * - hold to talk: recording runs while the finger is down, letting go sends;
 * - double tap: records without holding, a tap finishes («fixed» mode);
 * - one short tap: nothing is sent, a hint says how to use it;
 * - keyboard (Enter/Space): starts/finishes like the double-tap mode.
 * The recorder opens on press so the start of the phrase isn't lost; a short
 * tap throws that recording away. Still capped at 15 s (lib/voice.ts).
 * Microphone refused: in a browser — steps to allow it, cleared by itself
 * when the permission changes; in the Android app — «Open settings».
 */

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { api } from "@/lib/api";
import { canOpenAppSettings, openAppSettings } from "@/lib/appSettings";
import { useLocale } from "@/lib/LocaleContext";
import { startRecording, voiceSupported, type Recording } from "@/lib/voice";

type Problem = "blocked" | "failed" | "nothing" | null;

/** pressed at least this long = «hold to talk» */
const HOLD_MS = 350;
/** two short taps closer than this = record without holding */
const DOUBLE_TAP_MS = 450;

export default function VoiceButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void;
  className?: string;
}) {
  const { t } = useLocale();
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [locked, setLocked] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [hint, setHint] = useState(false);
  const recRef = useRef<Recording | null>(null);
  // the microphone is being opened (permission window, slow device): a
  // second recorder must not start in parallel — the same phrase came back
  // twice (Redmi, 20.11.2026)
  const startingRef = useRef(false);
  // what the press asked for while the microphone was still opening
  const pendingRef = useRef<"send" | "cancel" | null>(null);
  const lockedRef = useRef(false);
  const pressingRef = useRef(false);
  const downAtRef = useRef(0);
  const lastTapRef = useRef(0);
  const ignoreUpRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only knowable after mount (SSR has no window)
    setSupported(voiceSupported());
    return () => {
      recRef.current?.cancel();
      clearTimeout(hintTimerRef.current);
    };
  }, []);

  // «nothing heard» / «failed» go away by themselves — the bubble covers what's above
  useEffect(() => {
    if (problem !== "nothing" && problem !== "failed") return;
    const id = setTimeout(() => setProblem(null), 6000);
    return () => clearTimeout(id);
  }, [problem]);

  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(id);
  }, [hint]);

  // while the «blocked» hint is up, drop it as soon as the browser's
  // microphone permission is no longer «denied» (where the API exists)
  useEffect(() => {
    if (problem !== "blocked" || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => status && status.state !== "denied" && setProblem(null);
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", onChange);
  }, [problem]);

  if (!supported) return null;

  const setLock = (on: boolean) => {
    lockedRef.current = on;
    setLocked(on);
  };

  const send = async (audio: Blob | null) => {
    recRef.current = null;
    setLock(false);
    if (!audio) {
      setState("idle");
      setProblem("nothing");
      return;
    }
    setState("transcribing");
    try {
      const { text } = await api.transcribeAudio(audio);
      if (text) onText(text);
      else setProblem("nothing");
    } catch {
      setProblem("failed");
    } finally {
      setState("idle");
    }
  };

  const begin = async () => {
    startingRef.current = true;
    pendingRef.current = null;
    let rec: Recording | null;
    try {
      rec = await startRecording(
        (audio) => void send(audio),
        (why) => {
          setState("idle");
          setLock(false);
          setProblem(why);
        },
      );
    } finally {
      startingRef.current = false;
    }
    if (!rec) return;
    if (pendingRef.current) {
      // let go before the microphone opened — none of the phrase is on it
      pendingRef.current = null;
      rec.cancel();
      setHint(true);
      return;
    }
    recRef.current = rec;
    setState("recording");
    try {
      navigator.vibrate?.(15);
    } catch {}
  };

  const finish = (action: "send" | "cancel") => {
    const rec = recRef.current;
    if (rec) {
      if (action === "send") {
        rec.stop(); // → send()
      } else {
        recRef.current = null;
        rec.cancel();
        setState("idle");
      }
    } else if (startingRef.current) {
      pendingRef.current = action;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // finger may slide off the button
    } catch {}
    setProblem(null);
    setHint(false);
    clearTimeout(hintTimerRef.current);
    if (state === "transcribing") return;
    if (lockedRef.current) {
      // «fixed» recording: a tap finishes it
      setLock(false);
      ignoreUpRef.current = true;
      finish("send");
      return;
    }
    pressingRef.current = true;
    downAtRef.current = Date.now();
    if (startingRef.current) {
      pendingRef.current = null; // the second tap of a double tap keeps that recorder
      return;
    }
    if (!recRef.current) void begin();
  };

  const onPointerUp = () => {
    if (ignoreUpRef.current) {
      ignoreUpRef.current = false;
      return;
    }
    if (!pressingRef.current) return;
    pressingRef.current = false;
    const now = Date.now();
    if (now - downAtRef.current >= HOLD_MS) {
      lastTapRef.current = 0;
      finish("send");
      return;
    }
    if (now - lastTapRef.current <= DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      setLock(true); // keep recording without holding
      return;
    }
    lastTapRef.current = now;
    finish("cancel");
    // only once a second tap can't come: the hint under the button moves it
    // up, and the second tap of a double tap missed it (found by the test)
    hintTimerRef.current = setTimeout(() => setHint(true), DOUBLE_TAP_MS);
  };

  // keyboard only (a pointer click has detail ≥ 1): Enter/Space toggles
  const onKeyboardClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0) return;
    setProblem(null);
    setHint(false);
    if (recRef.current) {
      setLock(false);
      finish("send");
    } else if (state === "idle" && !startingRef.current) {
      setLock(true);
      void begin();
    }
  };

  const inApp = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const message =
    problem === "blocked"
      ? inApp
        ? t.voiceBlockedApp
        : t.voiceBlockedBrowser
      : problem === "failed"
        ? t.voiceFailed
        : problem === "nothing"
          ? t.voiceNothing
          : null;
  const status =
    state === "recording" ? (locked ? t.voiceTapToStop : t.voiceReleaseToStop) : hint && !message ? t.voiceHoldHint : null;

  return (
    <span className={`relative inline-flex shrink-0 flex-col items-center ${className}`}>
      <button
        type="button"
        aria-label={state === "recording" ? t.voiceStop : state === "transcribing" ? t.voiceTranscribing : t.voiceStart}
        aria-pressed={state === "recording"}
        aria-busy={state === "transcribing"}
        title={state === "recording" ? t.voiceStop : t.voiceStart}
        disabled={state === "transcribing"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onKeyboardClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: "none" }}
        className={`flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border-2 transition ${
          state === "recording"
            ? "scale-110 animate-pulse border-danger bg-danger text-white shadow-lg"
            : "border-accent bg-surface text-accent-2 hover:bg-accent hover:text-on-accent disabled:opacity-70"
        }`}
      >
        {state === "transcribing" ? (
          <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {status && (
        // a bubble above the button, out of the layout: the finger covers the
        // button, and text under it squeezed the field next to it
        <span
          role="status"
          className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-48 rounded-xl bg-ink px-3 py-2 text-center text-xs font-medium text-surface shadow-lg"
        >
          {status}
        </span>
      )}
      {message && (
        // also a bubble, not text under the button: it moved the button up,
        // and the next tap landed on the field beside it (Redmi, 21.11.2026)
        <span
          role="status"
          className="absolute bottom-full right-0 z-20 mb-2 w-56 rounded-xl border border-danger bg-surface px-3 py-2 text-center text-xs text-danger shadow-lg"
        >
          {message}
          {problem === "blocked" && inApp && canOpenAppSettings() && (
            <button
              type="button"
              onClick={() => void openAppSettings()}
              className="mt-1 block w-full rounded-full border border-accent px-2 py-1 font-semibold text-accent-2"
            >
              {t.voiceOpenSettings}
            </button>
          )}
        </span>
      )}
    </span>
  );
}

/** Append dictated text to what's already typed, with a space in between. */
export function appendDictation(current: string, text: string): string {
  const base = current.trimEnd();
  return base ? `${base} ${text}` : text;
}
