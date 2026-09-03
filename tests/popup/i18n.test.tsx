import { CAPABILITIES, type PageContext, type WorkResolveResult } from "@auri/protocol";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXTENSION_VERSION } from "../../src/config/extension";
import { PopupView } from "../../src/popup/PopupApp";
import type { PopupState } from "../../src/popup/popup-state";
import { TransportFailure } from "../../src/transport/auri-transport";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

const context: PageContext = {
  url: "https://site.test/chapter-327.5",
  domain: "site.test",
  title: "Título original — Chapter 327.5",
  siteName: "Site original",
  detectedChapter: { value: "327.5", numericValue: 327.5, confidence: "high", source: "url" },
};
const matched: Extract<WorkResolveResult, { status: "matched" }> = {
  status: "matched",
  work: { id: "work-1", title: "Obra $CHAPTER$ <original>", currentChapter: { value: "326", numericValue: 326 } },
  source: { id: "source-1", domain: "site.test", name: "Site original", status: "active", isPreferred: false },
  match: { matchedBy: "title", confidence: "high" },
};
const ready = (result: WorkResolveResult): Extract<PopupState, { status: "ready" }> => ({
  status: "ready", context, result, capabilities: [...CAPABILITIES],
});

const translations = {
  en: {
    loading: "Analyzing this page…", unsupported: "Auri can't analyze this page.",
    disconnected: "Auri Desktop is unavailable.",
    incompatible: "This extension version isn't compatible with your current Auri version.",
    error: "Couldn't connect to Auri right now.", retry: "Try again",
    context: "Analyzed page", currentPage: "Current page", progress: "Progress",
    chapter: "Ch. 327.5", unknown: "Not provided", source: "Source recognized",
    notFound: "This work isn't in your Library yet.", addWork: "Add to Auri",
    addWorkSuccess: "Auri opened to add the work.", detected: "Detected chapter: Ch. 327.5",
    ambiguous: "We found more than one possible work.", open: "Open", current: "Current: Ch. 326",
    namedSuccess: `${matched.work.title} opened in Auri.`,
    update: "Update to 327.5", updateSuccess: "Progress updated to 327.5.", wait: "Please wait…",
    openWork: "Open in Auri", openWorkSuccess: "Work opened in Auri.",
    addSource: "Add this source", addSourceSuccess: "Source added to the work.",
    conflict: "This change needs to be confirmed in the Auri app.",
    failed: "Couldn't complete the action. Please try again.",
    previous: "This page is behind your current progress.",
  },
  pt_BR: {
    loading: "Analisando esta página…", unsupported: "Esta página não pode ser analisada pelo Auri.",
    disconnected: "O Auri Desktop não está disponível.",
    incompatible: "Esta versão da extensão não é compatível com a versão atual do Auri.",
    error: "Não foi possível consultar o Auri agora.", retry: "Tentar novamente",
    context: "Página analisada", currentPage: "Página atual", progress: "Progresso",
    chapter: "Cap. 327.5", unknown: "Não informado", source: "Fonte reconhecida",
    notFound: "Esta obra ainda não está na sua Biblioteca.", addWork: "Adicionar ao Auri",
    addWorkSuccess: "Auri aberto para adicionar a obra.", detected: "Capítulo detectado: Cap. 327.5",
    ambiguous: "Encontramos mais de uma obra possível.", open: "Abrir", current: "Atual: Cap. 326",
    namedSuccess: `${matched.work.title} aberto no Auri.`,
    update: "Atualizar para 327.5", updateSuccess: "Progresso atualizado para 327.5.", wait: "Aguarde…",
    openWork: "Abrir no Auri", openWorkSuccess: "Obra aberta no Auri.",
    addSource: "Adicionar esta fonte", addSourceSuccess: "Fonte adicionada à obra.",
    conflict: "O Auri precisa que essa alteração seja confirmada no aplicativo.",
    failed: "Não foi possível concluir. Tente novamente.",
    previous: "Esta página está antes do progresso atual.",
  },
};

describe.each(["en", "pt_BR"] as const)("popup localizado: %s", (locale) => {
  const copy = translations[locale];
  beforeEach(() => { installChromeI18nMock(locale); });

  function renderState(state: PopupState, transport = new MockAuriTransport("matched"), onRetry = vi.fn()) {
    return render(<PopupView state={state} transport={transport} onRetry={onRetry} />);
  }

  it.each(["loading", "unsupported", "disconnected", "incompatible", "error"] as const)(
    "traduz %s e mantém a ação de tentar novamente", (status) => {
      const onRetry = vi.fn();
      renderState({ status, context }, undefined, onRetry);
      expect(screen.getByRole("heading", { name: copy[status] })).toBeInTheDocument();
      expect(screen.getByText(`v${EXTENSION_VERSION}`)).toBeInTheDocument();
      if (["disconnected", "incompatible", "error"].includes(status)) {
        fireEvent.click(screen.getByRole("button", { name: copy.retry }));
        expect(onRetry).toHaveBeenCalledOnce();
      }
    },
  );

  it("traduz labels acessíveis e mantém os dados da biblioteca sem tradução", () => {
    renderState(ready(matched));
    expect(screen.getByRole("region", { name: copy.context })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.progress)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: matched.work.title })).toBeInTheDocument();
    expect(screen.getAllByText(context.siteName!)).toHaveLength(2);
    expect(screen.getByText(copy.chapter)).toBeInTheDocument();
    expect(screen.getByText(copy.source)).toBeInTheDocument();
  });

  it("traduz o título de fallback da página", () => {
    const { title: _title, ...withoutTitle } = context;
    renderState({ status: "disconnected", context: withoutTitle });
    expect(screen.getByRole("heading", { name: copy.currentPage })).toBeInTheDocument();
  });

  it("traduz obra ausente, capítulo e feedback sem alterar o payload de cadastro", async () => {
    const transport = new MockAuriTransport("not_found");
    const add = vi.spyOn(transport, "openAddWork").mockResolvedValue({ opened: true });
    renderState(ready({ status: "not_found" }), transport);
    expect(screen.getByRole("heading", { name: copy.notFound })).toBeInTheDocument();
    expect(screen.getByText(copy.detected)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.addWork }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.addWorkSuccess);
    expect(add).toHaveBeenCalledWith({
      pageUrl: context.url, title: context.title, sourceName: context.siteName,
      detectedChapter: context.detectedChapter,
    });
  });

  it("traduz candidatos e feedback com título dinâmico sem interpolá-lo novamente", async () => {
    const transport = new MockAuriTransport("ambiguous");
    const open = vi.spyOn(transport, "openWork").mockResolvedValue({ opened: true });
    renderState(ready({
      status: "ambiguous",
      candidates: [{ work: matched.work, match: matched.match }],
    }), transport);
    expect(screen.getByRole("heading", { name: copy.ambiguous })).toBeInTheDocument();
    expect(screen.getByText(copy.current)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.namedSuccess);
    expect(open).toHaveBeenCalledWith({ workId: matched.work.id });
  });

  it("traduz atualização, loading e feedback sem mudar o capítulo enviado", async () => {
    const transport = new MockAuriTransport("matched");
    const update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
    renderState(ready(matched), transport);
    fireEvent.click(screen.getByRole("button", { name: copy.update }));
    expect(screen.getByRole("button", { name: copy.wait })).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent(copy.updateSuccess);
    expect(update).toHaveBeenCalledWith({
      workId: matched.work.id, sourceId: matched.source!.id,
      chapter: { value: "327.5", numericValue: 327.5 }, pageUrl: context.url,
    });
  });

  it("traduz abertura e inclusão de fonte, preservando nome e URL", async () => {
    const transport = new MockAuriTransport("matched_no_source");
    vi.spyOn(transport, "openWork").mockResolvedValue({ opened: true });
    const add = vi.spyOn(transport, "addSource");
    const { source: _source, ...withoutSource } = matched;
    renderState(ready(withoutSource), transport);
    fireEvent.click(screen.getByRole("button", { name: copy.openWork }));
    expect(await screen.findByText(copy.openWorkSuccess)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.addSource }));
    expect(await screen.findByText(copy.addSourceSuccess)).toBeInTheDocument();
    expect(add).toHaveBeenCalledWith({ workId: matched.work.id, url: context.url, name: context.siteName });
  });

  it.each(["conflict", "failed"] as const)("traduz feedback de falha: %s", async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = new MockAuriTransport("matched");
    vi.spyOn(transport, "updateProgress").mockRejectedValue(failure === "conflict"
      ? new TransportFailure("protocol", { code: "CONFLICT", message: "INTERNAL" })
      : new TransportFailure("error"));
    renderState(ready(matched), transport);
    fireEvent.click(screen.getByRole("button", { name: copy.update }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy[failure]);
    expect(screen.queryByText("INTERNAL")).not.toBeInTheDocument();
  });

  it("traduz capítulo ausente e não oferece atualização", () => {
    const { detectedChapter: _chapter, ...withoutChapter } = context;
    renderState({ ...ready(matched), context: withoutChapter });
    expect(screen.getByText(copy.unknown)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.update })).not.toBeInTheDocument();
  });

  it("traduz aviso de capítulo anterior sem permitir regressão", () => {
    renderState(ready({ ...matched, work: { ...matched.work, currentChapter: { value: "400", numericValue: 400 } } }));
    expect(screen.getByText(copy.previous)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.update })).not.toBeInTheDocument();
  });
});
