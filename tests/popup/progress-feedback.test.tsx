import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { workResolveResultSchema, type WorkResolveResult } from "@auri/protocol";
import { ProgressFeedback } from "../../src/popup/ProgressFeedback";
import { useProgressConfirmation } from "../../src/popup/use-progress-confirmation";
import { MockAuriTransport } from "../../src/transport/mock-auri-transport";
import { TransportFailure } from "../../src/transport/auri-transport";
import { installChromeI18nMock } from "../helpers/chrome-i18n";
const match = workResolveResultSchema.parse({ status: "matched", work: { id: "local-work", title: "Synthetic", currentChapter: { value: "2", numericValue: 2 } }, match: { matchedBy: "title", confidence: "high" } }) as Extract<WorkResolveResult, { status: "matched" }>;
beforeEach(() => installChromeI18nMock("pt_BR"));
it("mantém a live region antes/durante/depois da ação e não suprime estados com aria-busy", () => {
  const onVerify=vi.fn(),view=render(<ProgressFeedback busy={false} onVerify={onVerify} />),region=screen.getByRole("status");
  expect(region).toBeEmptyDOMElement();
  const value={workId:"local-work",requested:{value:"3"},previous:{value:"2"},delivery:"accepted" as const};
  for(const [phase,text]of [["updating","Atualizando progresso…"],["confirming","Confirmando no Auri…"],["confirmed","Progresso confirmado"]] as const){
    view.rerender(<ProgressFeedback value={{...value,phase,saved:{value:"3"}}} busy={phase!=="confirmed"} onVerify={onVerify}/>);
    expect(screen.getByRole("status")).toBe(region);expect(region).toHaveAttribute("aria-live","polite");expect(region).toHaveAttribute("aria-atomic","true");expect(region).not.toHaveAttribute("aria-busy","true");expect(region).toHaveTextContent(text);
  }
  view.rerender(<ProgressFeedback value={{...value,phase:"unavailable",reason:"communication"}} busy={false} onVerify={onVerify}/>);
  const button=screen.getByRole("button",{name:"Consultar novamente"});button.focus();expect(button).toHaveFocus();fireEvent.click(button);expect(onVerify).toHaveBeenCalledOnce();
});
it.each([["pt_BR","Não foi possível validar o capítulo","O Auri recusou"],["en","Could not validate the chapter","Auri rejected"]])("validação local usa texto próprio em %s, sem envio/leitura",async(locale,title,wrong)=>{
  installChromeI18nMock(locale);const transport=new MockAuriTransport("legacy"),update=vi.spyOn(transport,"updateProgress"),read=vi.spyOn(transport,"resolveWork");
  const {result}=renderHook(()=>useProgressConfirmation({identity:"local",workId:match.work.id,resolution:match,context:{url:"https://local.example/chapter-3",detectedChapter:{value:"03",numericValue:3,confidence:"high",source:"url"}},capabilities:["work.resolve","progress.update"],transport}));
  await act(async()=>{await result.current.update({workId:match.work.id,chapter:{value:"03",numericValue:7}},{value:"2"})});
  render(<ProgressFeedback value={result.current.confirmation} busy={false} onVerify={vi.fn()}/>);expect(screen.getByRole("status")).toHaveTextContent(title);expect(screen.getByRole("status")).not.toHaveTextContent(wrong);expect(result.current.confirmation?.phase).toBe("failed");expect(update).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
});
it("recusa estruturada mantém mensagem remota e falha de comunicação permanece incerta",async()=>{
  const transport=new MockAuriTransport("legacy"),update=vi.spyOn(transport,"updateProgress").mockRejectedValue(new TransportFailure("protocol",{code:"VALIDATION_ERROR",message:"remote"}));
  const {result}=renderHook(()=>useProgressConfirmation({identity:"remote",workId:match.work.id,resolution:match,context:{url:"https://local.example/chapter-3",detectedChapter:{value:"03",numericValue:3,confidence:"high",source:"url"}},capabilities:["work.resolve","progress.update"],transport}));
  await act(async()=>{await result.current.update({workId:match.work.id,chapter:{value:"3"}},{value:"2"})});const view=render(<ProgressFeedback value={result.current.confirmation} busy={false} onVerify={vi.fn()}/>);expect(screen.getByRole("status")).toHaveTextContent("O Auri recusou");
  update.mockRejectedValue(new TransportFailure("protocol",{code:"AURI_NOT_READY",message:"uncertain"}));await act(async()=>{await result.current.update({workId:match.work.id,chapter:{value:"3"}},{value:"2"})});view.rerender(<ProgressFeedback value={result.current.confirmation} busy={false} onVerify={vi.fn()}/>);expect(screen.getByRole("status")).not.toHaveTextContent("O Auri recusou");expect(result.current.confirmation?.phase).toBe("unavailable");
});