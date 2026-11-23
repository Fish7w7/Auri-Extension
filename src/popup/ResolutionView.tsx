import type { DesktopOpenAddWorkParams } from "@auri/protocol";
import { t } from "../i18n";
import type { AuriTransport } from "../transport/auri-transport";
import { MatchedWork, type ReadingSessionProps } from "./MatchedWork";
import { PageHeading, ActionButton } from "./PopupShell";
import type { ReadyState } from "./popup-state";
import { formatChapter } from "./reading-model";
import type { PopupActions } from "./use-popup-actions";
import { hasTrustedWorkIdentity } from "./work-identity";

function addWorkDraft({ context, coverUrl, capabilities }: ReadyState): DesktopOpenAddWorkParams {
  return {
    pageUrl: context.url,
    ...(context.title && { title: context.title }),
    ...(context.siteName && { sourceName: context.siteName }),
    ...(context.canonicalUrl && { canonicalUrl: context.canonicalUrl }),
    ...(context.detectedChapter && { detectedChapter: context.detectedChapter }),
    ...(coverUrl && capabilities.includes("desktop.openAddWork.coverUrl") && { coverUrl }),
  };
}

function Suggestions({ state, actions, transport }: {
  state: ReadyState; actions: PopupActions; transport: AuriTransport;
}) {
  const { result, context, capabilities } = state;
  const canOpen = capabilities.includes("work.open");
  if (result.status === "not_found") return <>
    <h2>{t("notFoundTitle")}</h2>
    {context.detectedChapter && <p>{t("detectedChapter", formatChapter(context.detectedChapter))}</p>}
    {capabilities.includes("desktop.openAddWork") && <ActionButton actions={actions} action={{
      id: "add-work", label: t("addWork"), execute: () => transport.openAddWork(addWorkDraft(state)), success: t("addWorkSuccess"),
    }} />}
  </>;

  if (result.status === "ambiguous") return <>
    <h2>{t("ambiguousTitle")}</h2>
    <p>{t("ambiguousDescription")}</p>
    <ul className="candidate-list">{result.candidates.map(({ work }) => (
      <li key={work.id}>
        <div><strong>{work.title}</strong><small>{t("currentChapter", formatChapter(work.currentChapter))}</small></div>
        {canOpen && <ActionButton actions={actions} secondary action={{
          id: `candidate:${work.id}`, label: t("open"), execute: () => transport.openWork({ workId: work.id }),
          success: t("openWorkNamedSuccess", work.title),
        }} />}
      </li>
    ))}</ul>
  </>;

  return <>
    <p className="eyebrow">{t("possibleMatchEyebrow")}</p>
    <h2>{t("possibleMatchTitle")}</h2>
    <p>{t("possibleMatchDescription")}</p>
    <strong>{result.work.title}</strong>
    {canOpen && <ActionButton actions={actions} action={{
      id: "open", label: t("possibleMatchOpen"), execute: () => transport.openWork({ workId: result.work.id }),
      success: t("openWorkSuccess"),
    }} />}
  </>;
}

export function ResolutionView(props: ReadingSessionProps) {
  if (hasTrustedWorkIdentity(props.state.result)) {
    return <MatchedWork {...props} match={props.state.result} />;
  }
  return <>
    <PageHeading context={props.state.context} />
    <section className="message-card"><Suggestions {...props} /></section>
  </>;
}
