import { CAPABILITIES, workContextResultSchema, workResolveResultSchema, progressUpdateResultSchema, createErrorResponse, safeParseResponse, type ChapterValue, type PageContext, type WorkContextResult, type WorkResolveResult } from "@auri/protocol";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PopupApp, PopupView } from "../../src/popup/PopupApp";
import { useProgressConfirmation } from "../../src/popup/use-progress-confirmation";
import type { PopupState } from "../../src/popup/popup-state";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { TransportFailure } from "../../src/transport/auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

const page: PageContext = { url: "https://fixture.example/chapter-03", domain: "fixture.example", title: "Página sintética", detectedChapter: { value: "03", numericValue: 3, confidence: "high", source: "url" } };
const matched = workResolveResultSchema.parse({ status: "matched", work: { id: "work-verify", title: "Obra sintética", currentChapter: { value: "2", numericValue: 2 } }, source: { id: "source-verify", domain: "fixture.example", status: "active", isPreferred: true }, match: { matchedBy: "source_url", confidence: "exact" } }) as Extract<WorkResolveResult, { status: "matched" }>;
function context(saved: ChapterValue | null = { value: "3", numericValue: 3 }, id = matched.work.id): WorkContextResult {
  return workContextResultSchema.parse({ work: { id, title: id === matched.work.id ? matched.work.title : "Outra obra", userStatus: "reading", progress: saved }, page: { detectedChapter: page.detectedChapter, relation: saved?.numericValue === 3 ? "same" : "ahead" }, source: { state: "linked", matchedSourceId: "source-verify", domain: "fixture.example" }, continueTarget: null });
}
function ready(legacy = false, values: Partial<Extract<PopupState, { status: "ready" }>> = {}): Extract<PopupState, { status: "ready" }> {
  return { status: "ready", context: page, result: matched, capabilities: CAPABILITIES.filter(c => !legacy || c !== "work.context"), ...(!legacy ? { workContext: context({ value: "2", numericValue: 2 }) } : {}), ...values };
}
function setup(legacy = false) {
  const transport = new MockAuriTransport("legacy");
  const update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
  const read = vi.spyOn(transport, "getWorkContext").mockResolvedValue(context());
  const resolve = vi.spyOn(transport, "resolveWork").mockResolvedValue({ ...matched, work: { ...matched.work, currentChapter: { value: "3", numericValue: 3 } } });
  const view = render(<PopupView state={ready(legacy)} transport={transport} onRetry={vi.fn()} />);
  return { ...view, transport, update, read, resolve };
}
const start = () => fireEvent.click(screen.getByRole("button", { name: "Atualizar para capítulo 03" }));
const noSuccess = () => expect(document.querySelector(".progress-confirmation--confirmed")).toBeNull();
beforeEach(() => { installChromeI18nMock("pt_BR"); });

describe("update e confirmação por uma nova consulta", () => {
  it("só confirma após a releitura correta; mantém card e progresso sem atualização otimista", async () => {
    const { update, read } = setup();
    let accept!: (value: { updated: true }) => void, confirm!: (value: WorkContextResult) => void;
    update.mockImplementation(() => new Promise(done => { accept = done }));
    read.mockImplementation(() => new Promise(done => { confirm = done }));
    const card = screen.getByLabelText("Progresso");
    const button = screen.getByRole("button", { name: "Atualizar para capítulo 03" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(update).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Atualizando progresso…");
    expect(within(card).getByText("Cap. 2")).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled(); noSuccess();
    await act(async () => { accept({ updated: true }) });
    expect(screen.getByRole("status")).toHaveTextContent("Confirmando no Auri…");
    expect(screen.getByLabelText("Progresso")).toBe(card);
    expect(within(card).getByText("Cap. 2")).toBeInTheDocument(); noSuccess();
    await act(async () => { confirm(context()) });
    expect(await screen.findByText("Progresso confirmado")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("O capítulo 3 foi confirmado na biblioteca local do Auri.");
    expect(screen.getByRole("status")).toHaveTextContent("AnteriorCap. 2Salvo no AuriCap. 3");
    expect(update).toHaveBeenCalledExactlyOnceWith({ workId: matched.work.id, chapter: page.detectedChapter && { value: "03", numericValue: 3 }, sourceId: "source-verify", pageUrl: page.url });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({ workId: matched.work.id, page: { url: page.url, detectedChapter: page.detectedChapter } });
  });

  it.each(["2", "4"])("mostra progresso %s divergente, sem sucesso nem reenvio", async value => {
    const { read, update } = setup(); read.mockResolvedValue(context({ value, numericValue: Number(value) }));
    start();
    expect(await screen.findByText("Progresso diferente do solicitado")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`O Auri informou que o progresso salvo é o capítulo ${value}`);
    expect(screen.getAllByText(`Cap. ${value}`).length).toBeGreaterThan(0);
    noSuccess(); expect(update).toHaveBeenCalledOnce();
  });

  it("descarta uma Work diferente sem substituir o card", async () => {
    const { read } = setup(); read.mockResolvedValue(context({ value: "3", numericValue: 3 }, "other-work"));
    start();
    expect(await screen.findByText("A resposta pertence a outra obra. Os dados desta obra foram mantidos.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: matched.work.title })).toBeInTheDocument();
    expect(screen.queryByText("Outra obra")).not.toBeInTheDocument();
    expect(within(screen.getByText("Seu progresso").parentElement!).getByText("Cap. 2")).toBeInTheDocument(); noSuccess();
  });

  it.each([
    [context({ value: "3", numericValue: 3 }, "other-work"), "A resposta pertence a outra obra. Os dados desta obra foram mantidos."],
    [context({ value: "03", numericValue: 7 }), "O capítulo retornado não pôde ser comparado com segurança."],
  ] as const)("remove o motivo antigo após uma nova consulta correta: %o", async (first, warning) => {
    const { read, update } = setup(); read.mockResolvedValueOnce(first).mockResolvedValueOnce(context()); start();
    await screen.findByText(warning);
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("Progresso confirmado");
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("O capítulo 3 foi confirmado");
    expect(update).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("não confirma progresso null", async () => {
    const { read } = setup(); read.mockResolvedValue(context(null)); start();
    expect(await screen.findByText(/O Auri informou que não há progresso salvo/u)).toBeInTheDocument();
    noSuccess(); expect(screen.getByText("Nenhum capítulo registrado ainda.")).toBeInTheDocument();
  });

  it("não confirma dicas numéricas contraditórias, apesar de válidas no schema", async () => {
    const { read } = setup(); read.mockResolvedValue(context({ value: "03", numericValue: 7 })); start();
    expect(await screen.findByText("O capítulo retornado não pôde ser comparado com segurança.")).toBeInTheDocument(); noSuccess();
  });

  it("consulta manual é somente leitura e confirma o valor relido", async () => {
    const { read, update } = setup();
    read.mockResolvedValueOnce(context({ value: "2", numericValue: 2 })).mockResolvedValueOnce(context());
    start(); await screen.findByText("Progresso diferente do solicitado");
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    expect(await screen.findByText("Progresso confirmado")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2); expect(update).toHaveBeenCalledOnce();
  });

  it.each(["timeout", "disconnected", "invalid_message"] as const)("trata %s como incerto e permite verificar sem reenviar", async kind => {
    const { update, read } = setup(); update.mockRejectedValue(new TransportFailure(kind)); start();
    expect(await screen.findByText(["timeout", "disconnected"].includes(kind) ? "Não foi possível confirmar a atualização" : "Confirmação indisponível")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(["timeout", "disconnected"].includes(kind) ? "A comunicação com o Auri foi interrompida" : "Não foi possível saber se a atualização foi concluída");
    expect(read).not.toHaveBeenCalled(); noSuccess();
    expect(screen.getByRole("button", { name: "Abrir no Auri" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Atualizar para/u })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    expect(await screen.findByText("Progresso confirmado")).toBeInTheDocument();
    expect(update).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledOnce();
  });

  it("rejeição comprovada é falha, sem mensagem de sucesso ou consulta automática", async () => {
    const { update, read } = setup(); update.mockRejectedValue(new TransportFailure("protocol", { code: "CONFLICT", message: "não analisar este texto" })); start();
    expect(await screen.findByText("Atualização não realizada")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("confirmada no aplicativo");
    expect(screen.getByRole("button", { name: "Atualizar para capítulo 03" })).toBeEnabled();
    expect(read).not.toHaveBeenCalled(); noSuccess();
  });

  it("aceitação seguida de consulta indisponível não afirma falha da gravação", async () => {
    const { read, update } = setup(); read.mockRejectedValueOnce(new TransportFailure("timeout")).mockResolvedValueOnce(context()); start();
    expect(await screen.findByText("A atualização foi enviada, mas não foi possível confirmar o capítulo salvo.")).toBeInTheDocument();
    noSuccess(); expect(within(screen.getByText("Seu progresso").parentElement!).getByText("Cap. 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("Progresso confirmado"); expect(update).toHaveBeenCalledOnce();
  });

  it.each([
    [{ value: "3.5" }, { value: "3,5", numericValue: 3.5 }],
    [{ value: "03" }, { value: "3", numericValue: 3 }],
    [{ value: "  Prólogo   Especial " }, { value: "Prólogo Especial" }],
  ] as const)("confirma capítulos válidos sem depender de numericValue: %o / %o", async (requested, saved) => {
    const { rerender, transport, read } = setup();
    const detected = { ...requested, confidence: "high" as const, source: "manual" as const };
    rerender(<PopupView state={ready(false, { context: { ...page, detectedChapter: detected }, workContext: { ...context(null), page: { detectedChapter: detected, relation: "unknown" } } })} transport={transport} onRetry={vi.fn()} />);
    read.mockResolvedValue({ ...context(saved), page: { detectedChapter: detected, relation: "same" } });
    fireEvent.click(screen.getByRole("button", { name: /^Marcar capítulo/u }));
    await screen.findByText("Progresso confirmado");
    expect(screen.getByRole("status")).toHaveTextContent(`O capítulo ${saved.value} foi confirmado`);
  });

  it("erro interno não prova que a gravação foi desfeita", async () => {
    const { update, read } = setup(); update.mockRejectedValue(new TransportFailure("protocol", { code: "INTERNAL_ERROR", message: "VALIDATION_ERROR" })); start();
    await screen.findByText("Confirmação indisponível"); noSuccess(); expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível saber se a atualização foi concluída");
  });

  it("não envia um capítulo solicitado com numericValue contraditório", async () => {
    const { rerender, transport, update, read } = setup();
    rerender(<PopupView state={ready(false, { workContext: { ...context({ value: "2", numericValue: 2 }), page: { detectedChapter: { value: "03", numericValue: 7, confidence: "high", source: "url" }, relation: "ahead" } } })} transport={transport} onRetry={vi.fn()} />);
    start(); await screen.findByText("Não foi possível validar o capítulo"); expect(update).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
});

describe("fallback sem work.context (Desktop 1.13)", () => {
  it("relê work.resolve, valida matched/ID/progresso e nunca chama work.context", async () => {
    const { update, read, resolve } = setup(true); start();
    await screen.findByText("Progresso confirmado"); expect(resolve).toHaveBeenCalledExactlyOnceWith(page); expect(read).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledOnce();
  });
  it.each<WorkResolveResult>([
    { status: "not_found" },
    { status: "ambiguous", candidates: [{ work: matched.work, match: { matchedBy: "title", confidence: "possible" } }, { work: { id: "other", title: "Outra" }, match: { matchedBy: "title", confidence: "possible" } }] },
    { ...matched, work: { ...matched.work, currentChapter: null } },
    { ...matched, work: { id: matched.work.id, title: matched.work.title } },
    { ...matched, work: { ...matched.work, id: "other" } },
  ])("não confirma resolução insuficiente: %o", async result => {
    const { resolve, read } = setup(true); resolve.mockResolvedValue(workResolveResultSchema.parse(result)); start();
    await screen.findByText("Confirmação indisponível"); noSuccess(); expect(read).not.toHaveBeenCalled(); expect(screen.getByRole("heading", { name: matched.work.title })).toBeInTheDocument();
  });
  it("compara currentChapter sem numericValue e não oferece novo update após confirmar", async () => {
    const { resolve } = setup(true); resolve.mockResolvedValue({ ...matched, work: { ...matched.work, currentChapter: { value: "3" } } }); start();
    await screen.findByText("Progresso confirmado");
    expect(screen.queryByRole("button", { name: /Atualizar para/u })).not.toBeInTheDocument();
  });
  it("capítulo textual existente não recebe uma ordem numérica inventada", () => {
    const { rerender, transport } = setup(true);
    rerender(<PopupView state={ready(true, { result: { ...matched, work: { ...matched.work, currentChapter: { value: "Prólogo" } } } })} transport={transport} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Atualizar para/u })).not.toBeInTheDocument();
  });
  it("sem progress.update não oferece gravação", () => {
    const { rerender, transport, update } = setup(true);
    rerender(<PopupView state={ready(true, { capabilities: ["work.resolve", "work.open"] })} transport={transport} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Atualizar para/u })).not.toBeInTheDocument(); expect(update).not.toHaveBeenCalled();
  });
});

describe("ciclo de vida e consultas antigas", () => {
  it.each(["updating", "confirming"] as const)("troca de Work durante %s ignora conclusão antiga e libera a nova sessão", async phase => {
    const { rerender, transport, update, read } = setup();
    let releaseUpdate!: (value: { updated: true }) => void, releaseRead!: (value: WorkContextResult) => void;
    if (phase === "updating") update.mockImplementation(() => new Promise(done => { releaseUpdate = done }));
    else read.mockImplementation(() => new Promise(done => { releaseRead = done }));
    start(); if (phase === "confirming") await screen.findByText("Confirmando no Auri…");
    const other = context({ value: "2", numericValue: 2 }, "new-work");
    rerender(<PopupView state={ready(false, { result: { ...matched, work: { ...matched.work, id: "new-work", title: "Outra obra" } }, workContext: other })} transport={transport} onRetry={vi.fn()} />);
    await act(async () => { if (phase === "updating") releaseUpdate({ updated: true }); else releaseRead(context()); });
    expect(screen.getByRole("heading", { name: "Outra obra" })).toBeInTheDocument(); noSuccess();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Atualizar para capítulo 03" })).toBeEnabled();
    expect(read).toHaveBeenCalledTimes(phase === "updating" ? 0 : 1);
  });
  it("desmontagem não consulta nem publica confirmação de uma atualização antiga", async () => {
    const { unmount, update, read } = setup(); let done!: (value: { updated: true }) => void;
    update.mockImplementation(() => new Promise(resolve => { done = resolve })); start(); unmount();
    await act(async () => { done({ updated: true }) }); expect(read).not.toHaveBeenCalled();
  });
  it("mudança de URL invalida a sessão mesmo para a mesma Work", async () => {
    const { rerender, transport, read } = setup(); let done!: (value: WorkContextResult) => void;
    read.mockImplementation(() => new Promise(resolve => { done = resolve })); start(); await screen.findByText("Confirmando no Auri…");
    rerender(<PopupView state={ready(false, { context: { ...page, url: "https://fixture.example/other-page" } })} transport={transport} onRetry={vi.fn()} />);
    await act(async () => { done(context()) }); noSuccess(); expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("refresh iniciado antes do update não substitui a confirmação mais recente", async () => {
    const transport = new MockAuriTransport("legacy");
    vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
    let old!: (value: WorkContextResult) => void;
    vi.spyOn(transport, "getWorkContext").mockImplementationOnce(() => new Promise(done => { old = done })).mockResolvedValueOnce(context());
    const { result } = renderHook(() => useProgressConfirmation({ identity: "same-session", workId: matched.work.id, resolution: matched, context: page, capabilities: [...CAPABILITIES], transport }));
    let oldRead!: Promise<unknown>;
    act(() => { oldRead = result.current.refreshContext({ workId: matched.work.id, page: { url: page.url } }).catch(error => error); });
    await act(async () => { await result.current.update({ workId: matched.work.id, chapter: { value: "03", numericValue: 3 } }, { value: "2", numericValue: 2 }); });
    expect(result.current.confirmation?.phase).toBe("confirmed");
    await act(async () => { old(context({ value: "2", numericValue: 2 })); await oldRead; });
    expect(result.current.confirmation?.phase).toBe("confirmed");
    expect(result.current.confirmation?.saved?.value).toBe("3");
    expect(result.current.observed?.kind === "context" && result.current.observed.result.work.progress?.value).toBe("3");
  });
  it("carga inicial antiga não sobrescreve uma aba mais recente", async () => {
    let activate!: () => void, old!: (result: WorkResolveResult) => void;
    const addListener = vi.fn((listener: () => void) => { activate = listener });
    vi.stubGlobal("chrome", { ...chrome, tabs: { onActivated: { addListener, removeListener: vi.fn() } } });
    const transport = new MockAuriTransport("legacy");
    vi.spyOn(transport, "hello").mockResolvedValue({ protocolVersion: 1, server: { kind: "desktop", name: "Auri", version: "1.14.0" }, capabilities: [...CAPABILITIES] });
    const resolve = vi.spyOn(transport, "resolveWork").mockImplementationOnce(() => new Promise(done => { old = done })).mockResolvedValue({ ...matched, work: { ...matched.work, id: "new-work", title: "Outra obra" } });
    const read = vi.spyOn(transport, "getWorkContext").mockResolvedValue(context({ value: "2", numericValue: 2 }, "new-work"));
    const readPage = vi.fn().mockResolvedValueOnce({ status: "ready", context: page }).mockResolvedValue({ status: "ready", context: { ...page, url: "https://fixture.example/new-tab" } });
    render(<PopupApp transport={transport} readPage={readPage} />);
    await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    await act(async () => { activate() }); await screen.findByRole("heading", { name: "Outra obra" });
    await act(async () => { old(matched) });
    expect(screen.getByRole("heading", { name: "Outra obra" })).toBeInTheDocument();
    expect(read).toHaveBeenCalledOnce();
  });
});


describe("AURI_NOT_READY sem prova de recusa", () => {
  it("Desktop sem work.context recupera entrega incerta por work.resolve, sem repetir escrita", async () => {
    const { update, resolve, read } = setup(true);
    update.mockRejectedValue(new TransportFailure("protocol", { code: "AURI_NOT_READY", message: "opaque" }));
    start(); await screen.findByText("Não foi possível confirmar a atualização");
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("Progresso confirmado");
    expect(resolve).toHaveBeenCalledExactlyOnceWith(page); expect(read).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledOnce();
  });

  it.each([false, true])("consulta apenas após ação manual; possível persistência=%s", async persisted => {
    const { update, read } = setup();
    const wire = createErrorResponse("update-lost", "progress.update", { code: "AURI_NOT_READY", message: "não inferir causa por este texto" });
    expect(safeParseResponse(wire).success).toBe(true);
    update.mockImplementation(async () => { throw new TransportFailure("protocol", wire.error); });
    read.mockResolvedValue(context(persisted ? { value: "3", numericValue: 3 } : { value: "2", numericValue: 2 }));
    start();
    await screen.findByText("Não foi possível confirmar a atualização");
    expect(screen.getByRole("status")).toHaveTextContent("A comunicação com o Auri foi interrompida. Consulte novamente para verificar o capítulo salvo.");
    expect(screen.queryByText("Atualização não realizada")).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled(); noSuccess();
    expect(screen.getByRole("button", { name: "Abrir no Auri" })).toBeEnabled();
    const verify = screen.getByRole("button", { name: "Consultar novamente" });
    act(() => { fireEvent.click(verify); fireEvent.click(verify); });
    await screen.findByText(persisted ? "Progresso confirmado" : "Progresso diferente do solicitado");
    expect(update).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(persisted ? "Salvo no AuriCap. 3" : "Salvo no AuriCap. 2");
    if (!persisted) {
      noSuccess();
      update.mockResolvedValue(progressUpdateResultSchema.parse({ updated: true })); read.mockResolvedValue(context());
      start(); await screen.findByText("Progresso confirmado");
      expect(update).toHaveBeenCalledTimes(2); // Second write requires this explicit click.
    }
  });
  it("consulta indisponível e depois outra Work não permitem falso sucesso; recuperação não reenvia", async () => {
    const { update, read } = setup();
    update.mockRejectedValue(new TransportFailure("protocol", { code: "AURI_NOT_READY", message: "opaque" }));
    read.mockRejectedValueOnce(new TransportFailure("disconnected")).mockResolvedValueOnce(context({ value: "3", numericValue: 3 }, "other-work")).mockResolvedValueOnce(context());
    start(); await screen.findByText("Não foi possível confirmar a atualização");
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("Confirmação indisponível"); noSuccess();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("A resposta pertence a outra obra. Os dados desta obra foram mantidos."); noSuccess();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await screen.findByText("Progresso confirmado"); expect(update).toHaveBeenCalledOnce();
  });
  it("mantém feedback de conexão em inglês", async () => {
    installChromeI18nMock("en"); const { update, read } = setup();
    update.mockRejectedValue(new TransportFailure("protocol", { code: "AURI_NOT_READY", message: "opaque" })); fireEvent.click(screen.getByRole("button", { name: "Update to chapter 03" }));
    await screen.findByText("Couldn't confirm the update");
    expect(screen.getByRole("status")).toHaveTextContent("The connection to Auri was interrupted. Check again to verify the saved chapter.");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("Progress confirmed"); expect(read).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce();
  });
});
