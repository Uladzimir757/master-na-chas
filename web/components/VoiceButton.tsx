"use client";

/**
 * Microphone button for client text fields (20.11.2026): the client says it,
 * the recognised text is appended to the field.
 *  - in the Android app: @capgo/capacitor-speech-recognition — the app's
 *    WebView has no Web Speech API (manifest declares RECORD_AUDIO and the
 *    RecognitionService <queries> entry);
 *  - in a browser: the Web Speech API (Chrome, Safari on iPhone).
 * Where neither exists (Firefox, old browsers) the button isn't shown — the
 * phone keyboard's own dictation still works there.
 * Language: the page's (pl-PL / en-GB), not the phone's.
 */

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocale } from "@/lib/LocaleContext";

type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function webRecognitionCtor(): (new () => WebRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => WebRecognition;
    webkitSpeechRecognition?: new () => WebRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const isNativeApp = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

export default function VoiceButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void;
  className?: string;
}) {
  const { t, locale } = useLocale();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webRef = useRef<WebRecognition | null>(null);
  const lang = locale === "en" ? "en-GB" : "pl-PL";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isNativeApp()) {
        try {
          const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");
          const { available } = await SpeechRecognition.available();
          if (!cancelled) setSupported(available);
        } catch {
          if (!cancelled) setSupported(false);
        }
      } else if (!cancelled) {
        setSupported(webRecognitionCtor() !== null);
      }
    })();
    return () => {
      cancelled = true;
      webRef.current?.stop();
    };
  }, []);

  if (!supported) return null;

  const startNative = async () => {
    const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      setError(t.voiceNoPermission);
      return;
    }
    setListening(true);
    try {
      // one phrase; resolves with the final text once the client stops talking
      const res = await SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: false, popup: false });
      const text = res.matches?.[0]?.trim();
      if (text) onText(text);
    } catch {
      setError(t.voiceError);
    } finally {
      setListening(false);
    }
  };

  const startWeb = () => {
    const Ctor = webRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError(t.voiceNoPermission);
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(t.voiceError);
    };
    rec.onend = () => setListening(false);
    webRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setError(t.voiceError);
    }
  };

  const stop = async () => {
    if (isNativeApp()) {
      try {
        const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");
        await SpeechRecognition.stop();
      } catch {
        // already stopped
      }
    } else {
      webRef.current?.stop();
    }
    setListening(false);
  };

  return (
    <span className={`inline-flex shrink-0 flex-col items-center ${className}`}>
      <button
        type="button"
        aria-label={listening ? t.voiceStop : t.voiceStart}
        aria-pressed={listening}
        title={listening ? t.voiceStop : t.voiceStart}
        onClick={() => {
          setError(null);
          if (listening) void stop();
          else if (isNativeApp()) void startNative();
          else startWeb();
        }}
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
          listening
            ? "animate-pulse border-danger bg-danger text-white"
            : "border-accent bg-surface text-accent-2 hover:bg-accent hover:text-on-accent"
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      </button>
      {error && <span className="mt-1 max-w-40 text-center text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Append dictated text to what's already typed, with a space in between. */
export function appendDictation(current: string, text: string): string {
  const base = current.trimEnd();
  return base ? `${base} ${text}` : text;
}
