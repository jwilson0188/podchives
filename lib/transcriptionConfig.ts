import { COST_MODEL } from "./constants";

/** How we turn audio (or YouTube captions) into transcript segments. */
export type TranscriptionBackend =
  | "youtube_captions_then_groq"
  | "groq"
  | "openai";

export function getTranscriptionBackend(): TranscriptionBackend {
  const raw = (process.env.TRANSCRIPTION_BACKEND ?? "youtube_captions_then_groq")
    .trim()
    .toLowerCase();
  if (raw === "groq") return "groq";
  if (raw === "openai") return "openai";
  return "youtube_captions_then_groq";
}

export function shouldTryYouTubeCaptions(
  sourcePlatform: string,
  backend: TranscriptionBackend = getTranscriptionBackend(),
): boolean {
  return (
    backend === "youtube_captions_then_groq" &&
    sourcePlatform.toLowerCase() === "youtube"
  );
}

export function shouldTryRssFeedTranscript(
  transcriptOriginalUrl: string | null | undefined,
  sourcePlatform: string,
): boolean {
  return (
    sourcePlatform.toLowerCase() === "rss" &&
    Boolean(transcriptOriginalUrl?.trim())
  );
}

export function getTranscriptionApiBackend(
  backend: TranscriptionBackend = getTranscriptionBackend(),
): "groq" | "openai" {
  return backend === "openai" ? "openai" : "groq";
}

export function getTranscriptionModel(api: "groq" | "openai"): string {
  return api === "groq" ? "whisper-large-v3-turbo" : "whisper-1";
}

/** List-price $/minute for cost estimates (actual billing not connected). */
export function getTranscriptionCostPerMinute(
  backend: TranscriptionBackend = getTranscriptionBackend(),
): number {
  if (backend === "openai") {
    return COST_MODEL.openaiTranscriptionUsdPerMinute;
  }
  return COST_MODEL.groqTranscriptionUsdPerMinute;
}

export function getTranscriptionProviderLabel(
  backend: TranscriptionBackend = getTranscriptionBackend(),
): string {
  switch (backend) {
    case "openai":
      return "OpenAI Whisper API";
    case "groq":
      return "Groq Whisper";
    default:
      return "YouTube captions → Groq Whisper";
  }
}
