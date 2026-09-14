import {
  CAPABILITIES,
  PROTOCOL_VERSION,
  type PageContext,
  type ProgressUpdateParams,
  type SourceAddParams,
  type SystemHelloParams,
  type SystemHelloResult,
  type WorkContextParams,
  type WorkContextResult,
  type WorkResolveResult,
} from "@auri/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupApp, PopupView } from "../../src/popup/PopupApp";
import type { PopupState } from "../../src/popup/popup-state";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

beforeEach(() => { installChromeI18nMock("pt_BR"); });

const pageContext: PageContext = {
  url: "https://toonlivre.net/o-governante-das-trevas/capitulo-16",
  canonicalUrl: "https://toonlivre.net/o-governante-das-trevas/16",
  title: "O Governante das Trevas — Capítulo 16",
  siteName: "ToonLivre",
  domain: "toonlivre.net",
  detectedChapter: {
    value: "16",
    numericValue: 16,
    confidence: "high",
    source: "url",
  },
};

const matched: Extract<WorkResolveResult, { status: "matched" }> = {
  status: "matched",
  work: {
    id: "work-dark-ruler",
    title: "O Governante das Trevas",
    currentChapter: { value: "14", numericValue: 14 },
  },
  source: {
    id: "source-toonlivre",
    name: "ToonLivre",
    domain: "toonlivre.net",
    status: "active",
    isPreferred: true,
  },
  match: { matchedBy: "source_url", confidence: "exact" },
};

const baseContext: WorkContextResult = {
  work: {
    id: matched.work.id,
    title: matched.work.title,
    userStatus: "reading",
    progress: { value: "14", numericValue: 14 },
  },
  page: {
    detectedChapter: pageContext.detectedChapter!,
    relation: "ahead",
  },
  source: {
    state: "linked",
    matchedSourceId: "source-toonlivre",
    name: "ToonLivre",
    domain: "toonlivre.net",
    seriesUrl: "https://toonlivre.net/o-governante-das-trevas",
    lastReadUrl: "https://toonlivre.net/reader?id=14",
  },
  continueTarget: {
    url: "https://toonlivre.net/reader?id=14",
    chapter: { value: "14", numericValue: 14 },
  },
};

function ready(workContext: WorkContextResult): Extract<PopupState, { status: "ready" }> {
  return {
    status: "ready",
    context: pageContext,
    result: matched,
    capabilities: [...CAPABILITIES],
    workContext,
  };
}

function renderContext(
  workContext: WorkContextResult,
  options: {
    transport?: MockAuriTransport;
    refresh?: (params: WorkContextParams) => Promise<WorkContextResult>;
    navigate?: (url: string) => Promise<unknown>;
  } = {},
) {
  return render(
    <PopupView
      state={ready(workContext)}
      transport={options.transport ?? new MockAuriTransport("context_ahead")}
      onRetry={vi.fn()}
      onRefreshContext={options.refresh}
      navigateToUrl={options.navigate}
    />,
  );
}

const helloResult = (): SystemHelloResult => ({
  protocolVersion: PROTOCOL_VERSION,
  server: { kind: "desktop", name: "Auri Desktop", version: "1.14.0" },
  capabilities: [...CAPABILITIES, "future.capability"],
});

describe("negociação de work.context", () => {
  it("executa hello, lê a página, resolve a obra e consulta o contexto nessa ordem", async () => {
    const calls: string[] = [];
    class RecordingTransport extends MockAuriTransport {
      contextParams?: WorkContextParams;

      override async hello(_params: SystemHelloParams) {
        calls.push("hello");
        return helloResult();
      }

      override async resolveWork(params: PageContext) {
        calls.push("resolve");
        expect(params).toEqual(pageContext);
        return matched;
      }

      override async getWorkContext(params: WorkContextParams) {
        calls.push("context");
        this.contextParams = params;
        return baseContext;
      }
    }

    const transport = new RecordingTransport("context_ahead");
    render(
      <PopupApp
        transport={transport}
        readPage={async () => {
          calls.push("page");
          return { status: "ready", context: pageContext };
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: matched.work.title })).toBeInTheDocument();
    expect(calls).toEqual(["hello", "page", "resolve", "context"]);
    expect(transport.contextParams).toEqual({
      workId: matched.work.id,
      page: {
        url: pageContext.url,
        canonicalUrl: pageContext.canonicalUrl,
        detectedChapter: pageContext.detectedChapter,
      },
    });
  });

  it("não chama work.context e mantém a UI 0.2 quando a capability está ausente", async () => {
    const transport = new MockAuriTransport("legacy");
    const contextSpy = vi.spyOn(transport, "getWorkContext");
    render(<PopupApp transport={transport} readPage={async () => ({ status: "ready", context: pageContext })} />);

    expect(await screen.findByRole("button", { name: "Abrir no Auri" })).toBeInTheDocument();
    expect(contextSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Seu progresso")).not.toBeInTheDocument();
    expect(screen.queryByText(/incompatível/iu)).not.toBeInTheDocument();
  });
});

describe("relações e ações do contexto de leitura", () => {
  it("renderiza página da obra e continua exatamente no target fornecido", async () => {
    const navigate = vi.fn(async () => undefined);
    const seriesPage: WorkContextResult = {
      ...baseContext,
      page: { detectedChapter: null, relation: "series_page" },
      continueTarget: {
        url: "https://toonlivre.net/reader?work=dark-ruler&chapter=14",
        chapter: { value: "14", numericValue: 14 },
      },
    };
    renderContext(seriesPage, { navigate });

    expect(screen.getByText("Você parou no capítulo 14.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar no capítulo 14" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(seriesPage.continueTarget!.url));
    expect(navigate).not.toHaveBeenCalledWith(`${seriesPage.source.seriesUrl}/14`);
  });

  it("não mostra Continue sem target nem quando ele já é a página atual", () => {
    const { rerender } = renderContext({ ...baseContext, continueTarget: null });
    expect(screen.queryByRole("button", { name: /Continuar/iu })).not.toBeInTheDocument();

    rerender(
      <PopupView
        state={ready({ ...baseContext, page: { ...baseContext.page, relation: "same" }, continueTarget: { url: pageContext.url } })}
        transport={new MockAuriTransport("context_same")}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Você está em dia.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continuar/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar/iu })).not.toBeInTheDocument();
  });

  it("não oferece regressão em behind e mantém Continue quando existe target", () => {
    renderContext({
      ...baseContext,
      page: {
        detectedChapter: { value: "10", numericValue: 10, confidence: "high", source: "url" },
        relation: "behind",
      },
    });

    expect(screen.getByText("Você parou no capítulo 14.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar no capítulo 14" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar/iu })).not.toBeInTheDocument();
  });

  it("preserva capítulos textuais e não inventa comparação em unknown", () => {
    renderContext({
      ...baseContext,
      work: { ...baseContext.work, progress: { value: "Extra" } },
      page: {
        detectedChapter: { value: "Prólogo", confidence: "medium", source: "metadata" },
        relation: "unknown",
      },
      continueTarget: null,
    });

    expect(screen.getByText("Cap. Extra")).toBeInTheDocument();
    expect(screen.getByText("Cap. Prólogo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar|Marcar/iu })).not.toBeInTheDocument();
  });

  it("permite marcar capítulo textual quando ainda não existe progresso", async () => {
    const transport = new MockAuriTransport("context_no_progress");
    const update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
    const refresh = vi.fn(async () => baseContext);
    renderContext({
      ...baseContext,
      work: { ...baseContext.work, progress: null },
      page: {
        detectedChapter: { value: "Prólogo", confidence: "medium", source: "metadata" },
        relation: "unknown",
      },
      continueTarget: null,
    }, { transport, refresh });

    expect(screen.getByText("Nenhum capítulo registrado ainda.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar capítulo Prólogo" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      workId: matched.work.id,
      chapter: { value: "Prólogo" },
      pageUrl: pageContext.url,
      sourceId: "source-toonlivre",
    }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("atualiza progresso, mantém conteúdo durante a espera e refresca para same", async () => {
    let releaseUpdate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseUpdate = resolve; });

    class RefreshingTransport extends MockAuriTransport {
      updated = false;
      readonly contextCalls: WorkContextParams[] = [];
      readonly progressCalls: ProgressUpdateParams[] = [];

      override async hello() { return helloResult(); }
      override async resolveWork() { return matched; }
      override async getWorkContext(params: WorkContextParams) {
        this.contextCalls.push(params);
        return this.updated
          ? {
              ...baseContext,
              work: { ...baseContext.work, progress: { value: "16", numericValue: 16 } },
              page: { ...baseContext.page, relation: "same" as const },
              continueTarget: { url: pageContext.url, chapter: { value: "16", numericValue: 16 } },
            }
          : baseContext;
      }
      override async updateProgress(params: ProgressUpdateParams) {
        this.progressCalls.push(params);
        await gate;
        this.updated = true;
        return { updated: true as const };
      }
    }

    const transport = new RefreshingTransport("context_ahead");
    render(<PopupApp transport={transport} readPage={async () => ({ status: "ready", context: pageContext })} />);
    const updateButton = await screen.findByRole("button", { name: "Atualizar para capítulo 16" });
    fireEvent.click(updateButton);

    expect(screen.getByRole("heading", { name: matched.work.title })).toBeInTheDocument();
    expect(screen.getByText("Cap. 14")).toBeInTheDocument();
    expect(screen.queryByText("Consultando sua biblioteca…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aguarde…" })).toBeDisabled();

    releaseUpdate();
    expect(await screen.findByText("Você está em dia.")).toBeInTheDocument();
    expect(screen.getAllByText("Cap. 16")).toHaveLength(2);
    expect(transport.contextCalls).toHaveLength(2);
    expect(transport.progressCalls).toEqual([{
      workId: matched.work.id,
      chapter: { value: "16", numericValue: 16 },
      pageUrl: pageContext.url,
      sourceId: "source-toonlivre",
    }]);
  });
});

describe("estado da fonte", () => {
  it("mostra linked de forma discreta", () => {
    renderContext(baseContext);
    expect(screen.getByText("Fonte vinculada")).toBeInTheDocument();
    expect(screen.getByText("ToonLivre")).toBeInTheDocument();
  });

  it("adiciona source unlinked, refresca o contexto e passa a linked", async () => {
    class SourceRefreshTransport extends MockAuriTransport {
      linked = false;
      readonly contextCalls: WorkContextParams[] = [];
      readonly sourceCalls: SourceAddParams[] = [];

      override async hello() { return helloResult(); }
      override async resolveWork() { return matched; }
      override async getWorkContext(params: WorkContextParams) {
        this.contextCalls.push(params);
        return {
          ...baseContext,
          source: this.linked
            ? baseContext.source
            : { state: "unlinked" as const, name: "ToonLivre", domain: "toonlivre.net" },
        };
      }
      override async addSource(params: SourceAddParams) {
        this.sourceCalls.push(params);
        this.linked = true;
        return {
          source: {
            id: "source-toonlivre",
            name: "ToonLivre",
            domain: "toonlivre.net",
            status: "active" as const,
            isPreferred: false,
          },
        };
      }
    }

    const transport = new SourceRefreshTransport("context_unlinked");
    render(<PopupApp transport={transport} readPage={async () => ({ status: "ready", context: pageContext })} />);
    expect(await screen.findByText("Esta página ainda não está vinculada como fonte.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar/iu })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar esta fonte" }));

    expect(await screen.findByText("Fonte adicionada à obra.")).toBeInTheDocument();
    expect(screen.getByText("Fonte vinculada")).toBeInTheDocument();
    expect(transport.contextCalls).toHaveLength(2);
    expect(transport.sourceCalls).toEqual([{
      workId: matched.work.id,
      url: pageContext.url,
      name: pageContext.siteName,
    }]);
  });

  it("não oferece source.add quando a fonte é ambígua", () => {
    renderContext({
      ...baseContext,
      source: { state: "ambiguous", name: "ToonLivre", domain: "toonlivre.net" },
      continueTarget: null,
    });
    expect(screen.getByText("Não foi possível confirmar esta fonte com segurança.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar esta fonte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir no Auri" })).toBeInTheDocument();
  });
});

describe("estados de conexão", () => {
  it("mantém o estado inicial neutro enquanto hello está pendente", () => {
    class PendingTransport extends MockAuriTransport {
      override hello(): Promise<SystemHelloResult> {
        return new Promise(() => undefined);
      }
    }
    render(<PopupApp transport={new PendingTransport("matched")} readPage={async () => ({ status: "ready", context: pageContext })} />);
    expect(screen.getByText("Consultando sua biblioteca…")).toBeInTheDocument();
    expect(screen.queryByText(/desconectado/iu)).not.toBeInTheDocument();
  });

  it("mantém o contexto visível durante retry", () => {
    let finishRetry!: () => void;
    const retry = vi.fn(() => new Promise<void>((resolve) => { finishRetry = resolve; }));
    render(
      <PopupView
        state={{ status: "error", context: pageContext }}
        transport={new MockAuriTransport("error")}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByRole("heading", { name: pageContext.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aguarde…" })).toBeDisabled();
    finishRetry();
  });
});
