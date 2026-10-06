import type { CallTranscriptTurn } from "@/lib/database.types";

/**
 * How the owner reads a transcript: in the call's language and its own script, the same
 * words in English letters, or in English. translate-transcript.ts adds these versions to
 * each turn after a call.
 */
export type TranscriptView = "script" | "latin" | "english";

export const TRANSCRIPT_VIEWS: TranscriptView[] = ["script", "latin", "english"];

// Unicode blocks of the Indian scripts a call may be written in.
const SCRIPTS: { language: string; from: number; to: number }[] = [
  { language: "Hindi", from: 0x0900, to: 0x097f },
  { language: "Bengali", from: 0x0980, to: 0x09ff },
  { language: "Punjabi", from: 0x0a00, to: 0x0a7f },
  { language: "Gujarati", from: 0x0a80, to: 0x0aff },
  { language: "Odia", from: 0x0b00, to: 0x0b7f },
  { language: "Tamil", from: 0x0b80, to: 0x0bff },
  { language: "Telugu", from: 0x0c00, to: 0x0c7f },
  { language: "Kannada", from: 0x0c80, to: 0x0cff },
  { language: "Malayalam", from: 0x0d00, to: 0x0d7f },
];

/**
 * The Indian language the transcript's script versions are written in, or null when there
 * is none: a call held in English, or one saved before the versions existed.
 */
export function transcriptLanguage(transcript: CallTranscriptTurn[]): string | null {
  const counts = new Map<string, number>();
  for (const turn of transcript) {
    for (const char of turn.script ?? "") {
      const code = char.codePointAt(0) ?? 0;
      const script = SCRIPTS.find((s) => code >= s.from && code <= s.to);
      if (script) counts.set(script.language, (counts.get(script.language) ?? 0) + 1);
    }
  }
  let language: string | null = null;
  for (const [name, count] of counts) if (!language || count > counts.get(language)!) language = name;
  return language;
}

/** A turn in the chosen view, or as it was said when that version is missing. */
export function turnText(turn: CallTranscriptTurn, view: TranscriptView | null): string {
  return (view && turn[view]?.trim()) || turn.en_text;
}
