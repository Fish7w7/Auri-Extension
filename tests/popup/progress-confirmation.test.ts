import { describe, expect, it } from "vitest";
import { compareProgressChapters, normalizeProgressChapter, isDefinitiveProgressRejection } from "../../src/popup/progress-confirmation";
import { TransportFailure } from "../../src/transport/auri-transport";
import type { ChapterValue } from "@auri/protocol";

describe("comparação verificável de ChapterValue", () => {
  it.each<[ChapterValue, ChapterValue, string]>([
    [{ value: "03", numericValue: 3 }, { value: "3", numericValue: 3 }, "same"],
    [{ value: "03" }, { value: "3" }, "same"],
    [{ value: "3.5" }, { value: "3,5", numericValue: 3.5 }, "same"],
    [{ value: "3.50", numericValue: 3.5 }, { value: "03,500" }, "same"],
    [{ value: "3.5" }, { value: "3" }, "different"],
    [{ value: "3" }, { value: "4" }, "different"],
    [{ value: " Prólogo  Especial " }, { value: "Prólogo Especial" }, "same"],
    [{ value: "Pro\u0301logo" }, { value: "Prólogo" }, "same"],
    [{ value: "Prólogo" }, { value: "prólogo" }, "different"],
    [{ value: "Prólogo" }, { value: "Prologo" }, "different"],
    [{ value: "10A" }, { value: "10" }, "different"],
    [{ value: "3", numericValue: 4 }, { value: "3" }, "unverifiable"],
    [{ value: "3" }, { value: "3", numericValue: 4 }, "unverifiable"],
    [{ value: "Prólogo", numericValue: 0 }, { value: "Prólogo" }, "unverifiable"],
    [{ value: "3" }, { value: "3", numericValue: NaN }, "unverifiable"],
    [{ value: "3" }, { value: "3", numericValue: Infinity }, "unverifiable"],
    [{ value: "9007199254740993" }, { value: "9007199254740992" }, "unverifiable"],
  ])("compara %o / %o como %s", (requested, saved, expected) => {
    expect(compareProgressChapters(requested, saved)).toBe(expected);
  });
  it("aceita DetectedChapter sem tratar confiança e fonte como parte do capítulo", () => {
    const detected = { value: "03", numericValue: 3, confidence: "high" as const, source: "url" as const };
    expect(normalizeProgressChapter(detected)).toEqual({ kind: "numeric", value: 3 });
    expect(compareProgressChapters(detected, { value: "3" })).toBe("same");
  });
  it("não confirma progresso ausente, nem inventa ordem para texto", () => {
    expect(compareProgressChapters({ value: "3" }, null)).toBe("unverifiable");
    expect(compareProgressChapters({ value: "3" }, undefined)).toBe("unverifiable");
    expect(normalizeProgressChapter({ value: "10A" })).toEqual({ kind: "text", value: "10A" });
  });
  it("distingue rejeições comprovadas de resultado incerto sem analisar mensagens", () => {
    expect(isDefinitiveProgressRejection(new TransportFailure("protocol", { code: "CONFLICT", message: "anything" }))).toBe(true);
    expect(isDefinitiveProgressRejection(new TransportFailure("protocol", { code: "VALIDATION_ERROR", message: "anything" }))).toBe(true);
    for (const error of [new TransportFailure("protocol", { code: "AURI_NOT_READY", message: "CONFLICT" }), new TransportFailure("timeout"), new TransportFailure("disconnected"), new TransportFailure("invalid_message"), new Error("CONFLICT"), new TransportFailure("protocol", { code: "INTERNAL_ERROR", message: "CONFLICT" })]) {
      expect(isDefinitiveProgressRejection(error)).toBe(false);
    }
  });
});
