import {
  CAPABILITIES,
  PROTOCOL_VERSION,
  type DesktopOpenAddWorkParams,
  type DesktopOpenAddWorkResult,
  type KnownCapability,
  type PageContext,
  type ProgressUpdateParams,
  type SystemHelloParams,
  type WorkResolveParams,
  type WorkResolveResult,
} from "@auri/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupApp, PopupView } from "../../src/popup/PopupApp";
import type { PopupState } from "../../src/popup/popup-state";
import { TransportFailure } from "../../src/transport/auri-transport";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

beforeEach(() => { installChromeI18nMock("pt_BR"); });

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

const ready = (
  result: WorkResolveResult,
  values: Partial<{
    context: PageContext;
    capabilities: KnownCapability[];
    coverUrl: string;
  }> = {},
): PopupState => ({
  status: "ready",
  context: values.context ?? context,
  result,
  capabilities: values.capabilities ?? [...CAPABILITIES],
  ...(values.coverUrl ? { coverUrl: values.coverUrl } : {}),
});

class RecordingAddWorkTransport extends MockAuriTransport {
  openAddWorkParams?: DesktopOpenAddWorkParams;

  override openAddWork(
    params: DesktopOpenAddWorkParams,
  ): Promise<DesktopOpenAddWorkResult> {
    this.openAddWorkParams = params;
    return Promise.resolve({ opened: true });
  }
}

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

  it("omite coverUrl para Desktop antigo mesmo quando a página tem capa", async () => {
    const oldDesktopCapabilities = CAPABILITIES.filter(
      (capability) => capability !== "desktop.openAddWork.coverUrl",
    );
    const recordingTransport = new RecordingAddWorkTransport("not_found");
    render(<PopupView
      state={ready(
        { status: "not_found" },
        {
          capabilities: oldDesktopCapabilities,
          coverUrl: "https://site.test/cover.jpg",
        },
      )}
      transport={recordingTransport}
      onRetry={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao Auri" }));
    await waitFor(() => expect(recordingTransport.openAddWorkParams).toBeDefined());

    expect(recordingTransport.openAddWorkParams).not.toHaveProperty("coverUrl");
  });

  it("inclui coverUrl quando o Desktop anuncia a capability", async () => {
    const recordingTransport = new RecordingAddWorkTransport("not_found");
    render(<PopupView
      state={ready(
        { status: "not_found" },
        { coverUrl: "https://site.test/cover.jpg" },
      )}
      transport={recordingTransport}
      onRetry={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao Auri" }));
    await waitFor(() => expect(recordingTransport.openAddWorkParams).toBeDefined());

    expect(recordingTransport.openAddWorkParams).toHaveProperty(
      "coverUrl",
      "https://site.test/cover.jpg",
    );
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

  it("orienta confirmação no Desktop ao receber CONFLICT", async () => {
    class ConflictTransport extends MockAuriTransport {
      override updateProgress(
        _params: ProgressUpdateParams,
      ): ReturnType<MockAuriTransport["updateProgress"]> {
        return Promise.reject(new TransportFailure("protocol", {
          code: "CONFLICT",
          message: "Confirmação necessária",
        }));
      }
    }
    render(<PopupView
      state={ready(matched)}
      transport={new ConflictTransport("matched")}
      onRetry={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Atualizar para 327" }));

    expect(await screen.findByText(
      "O Auri precisa que essa alteração seja confirmada no aplicativo.",
    )).toBeInTheDocument();
  });
});

describe("PopupApp com falhas do transporte nativo", () => {
  it("ignora capability futura desconhecida e continua work.resolve", async () => {
    class FutureCapabilitiesTransport extends MockAuriTransport {
      resolveParams?: WorkResolveParams;

      override hello(
        _params: SystemHelloParams,
      ): ReturnType<MockAuriTransport["hello"]> {
        return Promise.resolve({
          protocolVersion: PROTOCOL_VERSION,
          server: { kind: "desktop", name: "Auri Desktop", version: "2.0.0" },
          capabilities: ["work.resolve", "work.open", "future.capability"],
        });
      }

      override resolveWork(
        params: WorkResolveParams,
      ): ReturnType<MockAuriTransport["resolveWork"]> {
        this.resolveParams = params;
        return super.resolveWork(params);
      }
    }
    const futureTransport = new FutureCapabilitiesTransport("matched");
    render(<PopupApp
      transport={futureTransport}
      readPage={async () => ({
        status: "ready",
        context,
        coverUrl: "https://site.test/cover.jpg",
      })}
    />);

    expect(await screen.findByRole("heading", { name: "Nano Machine" })).toBeInTheDocument();
    expect(screen.queryByText(/protocolo incompatível/iu)).not.toBeInTheDocument();
    expect(futureTransport.resolveParams).toEqual(context);
    expect(futureTransport.resolveParams).not.toHaveProperty("coverUrl");
  });

  it.each([
    ["host ausente", new TransportFailure("host_not_found")],
    ["Port desconectado", new TransportFailure("disconnected")],
    ["Auri iniciando", new TransportFailure("protocol", {
      code: "AURI_NOT_READY",
      message: "Auri ainda não está pronto",
    })],
  ])("mostra estado recuperável quando %s", async (_label, failure) => {
    class UnavailableTransport extends MockAuriTransport {
      override hello(
        _params: SystemHelloParams,
      ): ReturnType<MockAuriTransport["hello"]> {
        return Promise.reject(failure);
      }
    }
    render(<PopupApp
      transport={new UnavailableTransport("matched")}
      readPage={async () => ({ status: "ready", context })}
    />);

    expect(await screen.findByText("O Auri Desktop não está disponível.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
