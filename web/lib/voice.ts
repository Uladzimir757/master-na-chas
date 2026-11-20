/**
 * Recording the client's voice for /api/transcribe (decision 20.11.2026, the
 * zlecai way): getUserMedia + MediaRecorder — works in browsers AND in the
 * Android app's WebView, unlike the Web Speech API. The server turns the
 * audio into text (OpenAI); nothing is kept.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari / iOS
  "audio/ogg;codecs=opus",
];
const MAX_SECONDS = 15;
// shorter than this is a tap, not speech — don't send it
const MIN_BYTES = 1024;

export type VoiceFailure = "blocked" | "failed";

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export type Recording = { stop: () => void };

/**
 * Starts recording; `onDone(blob)` gets the audio (or null for a too-short
 * tap), `onError` gets why it couldn't start. Stops by itself after 15 s.
 */
export async function startRecording(
  onDone: (audio: Blob | null) => void,
  onError: (why: VoiceFailure) => void,
): Promise<Recording | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    onError(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "failed");
    return null;
  }
  const mime = pickMime();
  let recorder: MediaRecorder;
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((tr) => tr.stop());
    onError("failed");
    return null;
  }
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) parts.push(e.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((tr) => tr.stop()); // free the microphone
    // the recorder's own type — Safari gives audio/mp4, don't guess
    const blob = new Blob(parts, { type: recorder.mimeType || mime || "audio/webm" });
    onDone(blob.size >= MIN_BYTES ? blob : null);
  };
  recorder.start();
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), MAX_SECONDS * 1000);
  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}
