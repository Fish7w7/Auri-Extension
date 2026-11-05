import { CAPABILITIES, createSuccessResponse, detectedChapterSchema, safeParseResponse, workContextResultSchema, workResolveResultSchema, type WorkContextResult, type WorkResolveResult } from "@auri/protocol";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PopupApp, PopupView } from "../../src/popup/PopupApp";
import { hasTrustedWorkIdentity, runWithTrustedWorkIdentity, UntrustedWorkIdentityError } from "../../src/popup/work-identity";
import { useProgressConfirmation } from "../../src/popup/use-progress-confirmation";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

const page = { url: "https://identity.example/chapter-03", title: "Página sintética", detectedChapter: detectedChapterSchema.parse({ value: "03", numericValue: 3, confidence: "high", source: "url" }) };
function match(confidence: "exact" | "high" | "possible" = "high", id = "identity-work", chapter = "2"): Extract<WorkResolveResult, { status: "matched" }> {
  const value = { status: "matched", work: { id, title: "Sugestão sintética", currentChapter: { value: chapter, numericValue: Number(chapter) } }, match: { matchedBy: "title", confidence } };
  return workResolveResultSchema.parse(value) as Extract<WorkResolveResult, { status: "matched" }>;
}
function context(chapter = "2"): WorkContextResult { return workContextResultSchema.parse({ work: { id: "identity-work", title: "Sugestão sintética", userStatus: "reading", progress: { value: chapter, numericValue: Number(chapter) } }, page: { detectedChapter: page.detectedChapter, relation: "ahead" }, source: { state: "unlinked" }, continueTarget: null }); }
function ready(result: WorkResolveResult, modern = false) { return { status: "ready" as const, context: page, result, capabilities: CAPABILITIES.filter(c => modern || c !== "work.context"), ...(modern ? { workContext: context() } : {}) }; }
const updateParams = { workId: "identity-work", chapter: { value: "03", numericValue: 3 }, pageUrl: page.url };
beforeEach(() => installChromeI18nMock("pt_BR"));

describe("política compartilhada de identidade do schema real", () => {
  it.each(["exact", "high"] as const)("aceita somente match %s válido e do ID esperado", confidence => {
    expect(safeParseResponse(createSuccessResponse("identity", "work.resolve", match(confidence))).success).toBe(true);
    expect(hasTrustedWorkIdentity(match(confidence), "identity-work")).toBe(true);
    expect(hasTrustedWorkIdentity(match(confidence), "other-work")).toBe(false);
  });
  it.each([match("possible"), { status: "not_found" }, { status: "ambiguous", candidates: [((({ status: _, ...r }) => r)(match("possible"))), ((({ status: _, ...r }) => r)(match("high", "other-work")))] }] as WorkResolveResult[])("recusa identidade insuficiente: %o", value => {
    expect(workResolveResultSchema.safeParse(value).success).toBe(true);
    expect(hasTrustedWorkIdentity(value)).toBe(false);
  });
  it.each([undefined, "certain", "", 1])("confiança ausente/inválida %o falha no schema e na política", confidence => {
    const value = { ...match(), match: { matchedBy: "title", confidence } };
    expect(workResolveResultSchema.safeParse(value).success).toBe(false);
    expect(hasTrustedWorkIdentity(value)).toBe(false);
  });
});

describe("suggestions never become write authority", () => {
  it.each([false, true])("possible não oferece update/source nem assume contexto moderno=%s", async modern => {
    const transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress"), source = vi.spyOn(transport, "addSource"), open = vi.spyOn(transport, "openWork").mockResolvedValue({ opened: true });
    render(<PopupView state={ready(match("possible"), modern)} transport={transport} onRetry={vi.fn()} />);
    expect(screen.getByText("Possível correspondência")).toBeInTheDocument();
    expect(screen.queryByText("Na sua biblioteca")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar|Adicionar esta fonte/u })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferir possível obra no Auri" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ workId: "identity-work" }));
    expect(update).not.toHaveBeenCalled(); expect(source).not.toHaveBeenCalled();
  });
  it.each([false, true])("carga inicial possible não consulta work.context, moderno=%s", async modern => {
    const transport = new MockAuriTransport("legacy");
    vi.spyOn(transport, "hello").mockResolvedValue({ protocolVersion: 1, server: { kind: "desktop", name: "Auri", version: modern ? "1.14.0" : "1.13.0" }, capabilities: [...ready(match(), modern).capabilities] });
    vi.spyOn(transport, "resolveWork").mockResolvedValue(match("possible"));
    const read = vi.spyOn(transport, "getWorkContext");
    render(<PopupApp transport={transport} readPage={async () => ({ status: "ready", context: page })} />);
    await screen.findByText("Possível correspondência"); expect(read).not.toHaveBeenCalled();
  });
  it("sugestão sem work.open não oferece nenhum atalho de associação", () => {
    render(<PopupView state={{ ...ready(match("possible")), capabilities: ["work.resolve", "source.add", "progress.update"] }} transport={new MockAuriTransport("legacy")} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("handler de fonte lê autoridade atual, inclusive para callback capturado antes", async () => {
    const transport = new MockAuriTransport("legacy"), add = vi.spyOn(transport, "addSource");
    let current: WorkResolveResult = match("high");
    const captured = () => runWithTrustedWorkIdentity(() => current, "identity-work", () => transport.addSource({ workId: "identity-work", url: page.url }));
    current = match("possible"); await expect(captured()).rejects.toBeInstanceOf(UntrustedWorkIdentityError);
    current = match("high", "other-work"); await expect(captured()).rejects.toBeInstanceOf(UntrustedWorkIdentityError);
    expect(add).not.toHaveBeenCalled();
  });
  it("hook recusa escrita direta e refresh de fonte com identidade fraca", async () => {
    const transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress"), read = vi.spyOn(transport, "getWorkContext");
    const { result } = renderHook(() => useProgressConfirmation({ identity: "weak", workId: "identity-work", resolution: match("possible"), context: page, capabilities: [...CAPABILITIES], transport }));
    await expect(result.current.update(updateParams, { value: "2" })).rejects.toBeInstanceOf(UntrustedWorkIdentityError);
    await expect(result.current.refreshContext({ workId: "identity-work", page: { url: page.url } })).rejects.toBeInstanceOf(UntrustedWorkIdentityError);
    expect(update).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("handler de progresso capturado antes de nova confiança não envia", async () => {
    const transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress");
    const { result, rerender } = renderHook(({ resolution }) => useProgressConfirmation({ identity: "same", workId: "identity-work", resolution, context: page, capabilities: [...CAPABILITIES], transport }), { initialProps: { resolution: match("high") } });
    const oldUpdate = result.current.update; rerender({ resolution: match("possible") });
    await act(async () => { await oldUpdate(updateParams, { value: "2" }); }); expect(update).not.toHaveBeenCalled();
  });
  it.each(["high", "medium", "low"] as const)("confiança da extração %s é independente da identidade", async confidence => {
    const transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
    vi.spyOn(transport, "resolveWork").mockResolvedValue(match("high", "identity-work", "3"));
    const { result } = renderHook(() => useProgressConfirmation({ identity: "chapter", workId: "identity-work", resolution: match("exact"), context: { ...page, detectedChapter: { ...page.detectedChapter, confidence } }, capabilities: ["work.resolve", "progress.update"], transport }));
    await act(async () => { await result.current.update(updateParams, { value: "2" }); });
    expect(update).toHaveBeenCalledTimes(confidence === "low" ? 0 : 1);
  });
});

describe("fallback de confirmação exige identidade e capítulo", () => {
  it.each([
    [match("exact", "identity-work", "3"), "confirmed"],
    [match("high", "identity-work", "3"), "confirmed"],
    [match("possible", "identity-work", "3"), "unavailable"],
    [match("high", "other-work", "3"), "unavailable"],
    [match("high", "identity-work", "4"), "divergent"],
    [{ status: "not_found" }, "unavailable"],
    [{ status: "ambiguous", candidates: [((({ status: _, ...r }) => r)(match("possible"))), ((({ status: _, ...r }) => r)(match("high", "other-work")))] }, "unavailable"],
  ] as const)("read-back %o termina em %s e nunca reenvia", async (saved, phase) => {
    const resolved = workResolveResultSchema.parse(saved), transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true });
    vi.spyOn(transport, "resolveWork").mockResolvedValue(resolved);
    const { result } = renderHook(() => useProgressConfirmation({ identity: "fallback", workId: "identity-work", resolution: match("high"), context: page, capabilities: ["work.resolve", "progress.update"], transport }));
    await act(async () => { await result.current.update(updateParams, { value: "2" }); });
    expect(result.current.confirmation?.phase).toBe(phase); expect(update).toHaveBeenCalledOnce();
  });
  it("confiança que enfraquece após envio impede confirmação; nova consulta só lê", async () => {
    const transport = new MockAuriTransport("legacy"), update = vi.spyOn(transport, "updateProgress").mockResolvedValue({ updated: true }), resolve = vi.spyOn(transport, "resolveWork").mockResolvedValueOnce(match("possible", "identity-work", "3")).mockResolvedValueOnce(match("exact", "identity-work", "3"));
    const { result } = renderHook(() => useProgressConfirmation({ identity: "weakened", workId: "identity-work", resolution: match("exact"), context: page, capabilities: ["work.resolve", "progress.update"], transport }));
    await act(async () => { await result.current.update(updateParams, { value: "2" }); });
    expect(result.current.confirmation).toMatchObject({ phase: "unavailable", reason: "untrusted_identity" });
    await act(async () => { await result.current.verify(); }); expect(result.current.confirmation?.phase).toBe("confirmed");
    expect(update).toHaveBeenCalledOnce(); expect(resolve).toHaveBeenCalledTimes(2);
  });
});