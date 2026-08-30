import { CAPABILITIES, type Capability, type PageContext, type WorkResolveResult } from "@auri/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PopupView } from "../src/popup/PopupApp";
import type { PopupState } from "../src/popup/popup-state";
import { MockAuriTransport } from "../src/transport/mock-auri-transport";

const transport = new MockAuriTransport("matched");
const context: PageContext = {
  url: "https://mangadex.org/title/nano/chapter-327",
  title: "Nano Machine — Chapter 327",
  siteName: "MangaDex",
  domain: "mangadex.org",
  detectedChapter: {
    value: "327",
    numericValue: 327,
    confidence: "high",
    source: "url",
  },
};
const matched: Extract<WorkResolveResult, { status: "matched" }> = {
  status: "matched",
  work: {
    id: "work-1",
    title: "Nano Machine",
    currentChapter: { value: "326", numericValue: 326 },
  },
  source: {
    id: "source-1",
    name: "MangaDex",
    domain: "mangadex.org",
    status: "active",
    isPreferred: false,
  },
  match: { matchedBy: "title", confidence: "high" },
};

function renderState(state: PopupState) {
  return render(<PopupView state={state} transport={transport} onRetry={vi.fn()} />);
}

const ready = (result: WorkResolveResult, values: Partial<{ context: PageContext; capabilities: Capability[] }> = {}): PopupState => ({
  status: "ready",
  context: values.context ?? context,
  result,
  capabilities: values.capabilities ?? [...CAPABILITIES],
});

describe("PopupView", () => {
  it("mostra loading leve", () => {
    renderState({ status: "loading" });
    expect(screen.getByRole("heading", { name: "Analisando esta página…" })).toBeInTheDocument();
  });

  it("mostra estado desconectado", () => {
    renderState({ status: "disconnected", context });
    expect(screen.getByText("O Auri Desktop não está disponível.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("mostra obra encontrada e capítulo detectado", () => {
    renderState(ready(matched));
    expect(screen.getByRole("heading", { name: "Nano Machine" })).toBeInTheDocument();
    expect(screen.getByText("Cap. 327")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar para 327" })).toBeInTheDocument();
    expect(screen.getByText("Fonte reconhecida")).toBeInTheDocument();
  });

  it("mostra obra não encontrada", () => {
    renderState(ready({ status: "not_found" }));
    expect(screen.getByText("Esta obra ainda não está na sua Biblioteca.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ao Auri" })).toBeInTheDocument();
  });

  it("mostra candidatos ambíguos sem escolher automaticamente", () => {
    renderState(ready({
      status: "ambiguous",
      candidates: [
        { work: matched.work, source: matched.source, match: { matchedBy: "title", confidence: "possible" } },
        { work: { id: "work-2", title: "Nano Machine (Novel)" }, match: { matchedBy: "alias", confidence: "possible" } },
      ],
    }));
    expect(screen.getByText("Encontramos mais de uma obra possível.")).toBeInTheDocument();
    expect(screen.getByText("Nano Machine (Novel)")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Abrir" })).toHaveLength(2);
  });

  it("oculta atualização quando a capability não foi negociada", () => {
    renderState(ready(matched, { capabilities: CAPABILITIES.filter((item) => item !== "progress.update") }));
    expect(screen.queryByRole("button", { name: "Atualizar para 327" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir no Auri" })).toBeInTheDocument();
  });

  it("não oferece atualização sem capítulo detectado", () => {
    const contextWithoutChapter = { ...context };
    delete contextWithoutChapter.detectedChapter;
    renderState(ready(matched, { context: contextWithoutChapter }));
    expect(screen.getByText("Não informado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar para/u })).not.toBeInTheDocument();
  });

  it("mostra protocolo incompatível", () => {
    renderState({ status: "incompatible", context });
    expect(screen.getByText("Esta versão da extensão não é compatível com a versão atual do Auri.")).toBeInTheDocument();
  });

  it("mostra erro recuperável", () => {
    renderState({ status: "error", context });
    expect(screen.getByText("Não foi possível consultar o Auri agora.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
