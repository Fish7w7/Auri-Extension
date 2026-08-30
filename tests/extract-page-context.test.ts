import { describe, expect, it } from "vitest";

import { extractPageContext } from "../src/extraction/extract-page-context";
import type { PageSnapshot } from "../src/extraction/page-snapshot";

const snapshot = (values: Partial<PageSnapshot> = {}): PageSnapshot => ({
  currentUrl: "https://reader.example/series/nano-machine",
  ...values,
});

describe("extractPageContext", () => {
  it("prioriza og:title e normaliza apenas espaços", () => {
    const result = extractPageContext(snapshot({ ogTitle: "  Nano   Machine  ", documentTitle: "Outro" }));
    expect(result).toMatchObject({ ok: true, context: { title: "Nano Machine" } });
  });

  it("usa o title e depois o h1 como fallback", () => {
    expect(extractPageContext(snapshot({ documentTitle: "Nano Machine" }))).toMatchObject({
      ok: true,
      context: { title: "Nano Machine" },
    });
    expect(extractPageContext(snapshot({ heading: "Nano Machine Webtoon" }))).toMatchObject({
      ok: true,
      context: { title: "Nano Machine Webtoon" },
    });
  });

  it("aceita canonical HTTP(S) e rejeita canonical insegura", () => {
    expect(extractPageContext(snapshot({ canonicalHref: "/works/nano-machine" }))).toMatchObject({
      ok: true,
      context: { canonicalUrl: "https://reader.example/works/nano-machine" },
    });
    const unsafe = extractPageContext(snapshot({ canonicalHref: "javascript:alert(1)" }));
    expect(unsafe.ok && unsafe.context.canonicalUrl).toBeUndefined();
  });

  it("usa og:site_name ou hostname para o site", () => {
    expect(extractPageContext(snapshot({ ogSiteName: "MangaDex" }))).toMatchObject({
      ok: true,
      context: { siteName: "MangaDex", domain: "reader.example" },
    });
    expect(extractPageContext(snapshot())).toMatchObject({
      ok: true,
      context: { siteName: "reader.example" },
    });
  });

  it("detecta capítulo rotulado na URL com confiança alta", () => {
    expect(extractPageContext(snapshot({ currentUrl: "https://reader.example/nano/chapter-327" }))).toMatchObject({
      ok: true,
      context: { detectedChapter: { value: "327", numericValue: 327, confidence: "high", source: "url" } },
    });
  });

  it("detecta capítulo no título quando a URL não contém evidência", () => {
    expect(extractPageContext(snapshot({ documentTitle: "Nano Machine — Capítulo 327" }))).toMatchObject({
      ok: true,
      context: { detectedChapter: { value: "327", confidence: "medium", source: "page-title" } },
    });
  });

  it("preserva capítulos decimais", () => {
    expect(extractPageContext(snapshot({ currentUrl: "https://reader.example/ch-327.5" }))).toMatchObject({
      ok: true,
      context: { detectedChapter: { value: "327.5", numericValue: 327.5 } },
    });
  });

  it("não trata números irrelevantes, ano, volume ou temporada como capítulo", () => {
    const result = extractPageContext(snapshot({
      currentUrl: "https://reader.example/works/93721?comment=812",
      documentTitle: "Obras de 2025 — Volume 12 — Temporada 2",
      heading: "938 comentários",
    }));
    expect(result.ok && result.context.detectedChapter).toBeUndefined();
  });

  it("não detecta capítulo quando não há evidência", () => {
    const result = extractPageContext(snapshot({ documentTitle: "Nano Machine" }));
    expect(result.ok && result.context.detectedChapter).toBeUndefined();
  });

  it.each(["chrome://extensions", "edge://settings", "about:blank", "nota-url"])(
    "rejeita página inválida ou interna: %s",
    (currentUrl) => {
      expect(extractPageContext(snapshot({ currentUrl }))).toEqual({ ok: false, reason: "unsupported" });
    },
  );
});
