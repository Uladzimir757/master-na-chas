"use client";

/**
 * Microphone button for client text fields (decision 20.11.2026, the zlecai
 * way): record on the device (lib/voice.ts) → POST /api/transcribe → OpenAI
 * → the text is appended to the field. It is never sent by itself: the client
 * checks it and presses the form's own button. Shown only where recording is
 * possible (checked after mount, so server and client render the same).
 * States: idle / recording (pulsing, aria-pressed) / transcribing (spinner).
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
  const [problem, setProblem] = useState<Problem>(null);
  const recRef = useRef<Recording | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only knowable after mount (SSR has no window)
    setSupported(voiceSupported());
    return () => recRef.current?.stop();
  }, []);

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

  const send = async (audio: Blob | null) => {
    recRef.current = null;
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

  const toggle = async () => {
    setProblem(null);
    if (state === "recording") {
      recRef.current?.stop();
      return;
    }
    // a second tap while the microphone is still being opened (permission
    // window, slow device) used to start a second recorder in parallel — the
    // same phrase came back twice (Redmi, 20.11.2026)
    if (state === "transcribing" || startingRef.current) return;
    startingRef.current = true;
    let rec: Recording | null;
    try {
      rec = await startRecording(
        (audio) => void send(audio),
        (why) => {
          setState("idle");
          setProblem(why);
        },
      );
    } finally {
      startingRef.current = false;
    }
    if (rec) {
      recRef.current = rec;
      setState("recording");
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

  return (
    <span className={`inline-flex shrink-0 flex-col items-center ${className}`}>
      <button
        type="button"
        aria-label={state === "recording" ? t.voiceStop : state === "transcribing" ? t.voiceTranscribing : t.voiceStart}
        aria-pressed={state === "recording"}
        aria-busy={state === "transcribing"}
        title={state === "recording" ? t.voiceStop : t.voiceStart}
        disabled={state === "transcribing"}
        onClick={() => void toggle()}
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
          state === "recording"
            ? "animate-pulse border-danger bg-danger text-white"
            : "border-accent bg-surface text-accent-2 hover:bg-accent hover:text-on-accent disabled:opacity-70"
        }`}
      >
        {state === "transcribing" ? (
          <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {message && (
        <span role="status" className="mt-1 max-w-44 text-center text-xs text-danger">
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
