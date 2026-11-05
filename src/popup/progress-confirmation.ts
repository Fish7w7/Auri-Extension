import { detectedChapterSchema, chapterValueSchema, type ChapterValue, type ProtocolErrorCode } from "@auri/protocol";
import { TransportFailure } from "../transport/auri-transport";

// Same numeric grammar and whitespace handling as Desktop normalizeChapter.
// The protocol validates shape/finite numbers, but does not validate label/hint agreement.
export function normalizeProgressChapter(chapter: ChapterValue | null | undefined):
  { kind: "numeric"; value: number } | { kind: "text"; value: string } | null {
  if (!chapterValueSchema.safeParse(chapter && { value: chapter.value, ...(chapter.numericValue === undefined ? {} : { numericValue: chapter.numericValue }) }).success || !chapter) return null;
  const value = chapter.value.trim().replace(/\s+/gu, " ").normalize("NFC");
  if (/^\d+(?:[.,]\d+)?$/u.test(value)) {
    const numeric = Number(value.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric > Number.MAX_SAFE_INTEGER ||
      (chapter.numericValue !== undefined && chapter.numericValue !== numeric)) return null;
    return { kind: "numeric", value: numeric };
  }
  // Textual labels retain case, accents and punctuation; no invented numeric ordering.
  return chapter.numericValue === undefined ? { kind: "text", value } : null;
}

export function canUseDetectedChapter(chapter: unknown): boolean {
  const parsed = detectedChapterSchema.safeParse(chapter);
  return parsed.success && parsed.data.confidence !== "low";
}

export function compareProgressChapters(requested: ChapterValue, saved: ChapterValue | null | undefined):
  "same" | "different" | "unverifiable" {
  const a = normalizeProgressChapter(requested), b = normalizeProgressChapter(saved);
  if (!a || !b) return "unverifiable";
  return a.kind === b.kind && a.value === b.value ? "same" : "different";
}

// AURI_NOT_READY may originate in Native Host after uncertain delivery; it is not a rejection proof.
// These protocol rejections occur before progress is committed. INTERNAL_ERROR and
// malformed replies can also occur after a write, so their outcome remains uncertain.
const REJECTED_BEFORE_WRITE: readonly ProtocolErrorCode[] = [
  "INVALID_MESSAGE", "INVALID_PARAMS", "UNSUPPORTED_PROTOCOL_VERSION", "METHOD_NOT_SUPPORTED",
  "UNAUTHORIZED_CLIENT", "WORK_NOT_FOUND", "SOURCE_NOT_FOUND",
  "AMBIGUOUS_MATCH", "CONFLICT", "VALIDATION_ERROR", "OPERATION_CANCELLED",
];
export function isDefinitiveProgressRejection(error: unknown): boolean {
  return error instanceof TransportFailure && (error.kind === "protocol" || error.kind === "incompatible") &&
    error.protocolError !== undefined && REJECTED_BEFORE_WRITE.includes(error.protocolError.code);
}
