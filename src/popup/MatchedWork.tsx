import { t } from "../i18n";
import type { AuriTransport } from "../transport/auri-transport";
import { createWorkContextParams } from "./page-context";
import type { NavigateToUrl, PopupViewProps, ReadyState } from "./popup-state";
import { ProgressFeedback } from "./ProgressFeedback";
import { ReadingView } from "./ReadingView";
import { getReadingModel } from "./reading-model";
import type { PopupAction, PopupActions } from "./use-popup-actions";
import { useProgressConfirmation } from "./use-progress-confirmation";
import { hasTrustedWorkIdentity, type TrustedWorkMatch } from "./work-identity";

export interface ReadingSessionProps {
  state: ReadyState;
  transport: AuriTransport;
  actions: PopupActions;
  identity: string;
  navigate: NavigateToUrl;
  readContext?: PopupViewProps["onRefreshContext"];
}

export function MatchedWork({ state, match, transport, actions, identity, readContext, navigate }:
  ReadingSessionProps & { match: TrustedWorkMatch }) {
  const { context, capabilities } = state;
  const workId = match.work.id;
  const progress = useProgressConfirmation({ identity, workId, resolution: match, transport, context, capabilities, readContext });
  const observed = progress.observed;
  const resolved = observed?.kind === "resolve" && hasTrustedWorkIdentity(observed.result, workId) ? observed.result : match;
  const detail = observed?.kind === "context" ? observed.result : state.workContext;
  const reading = getReadingModel(state, resolved, detail);
  const { update, resume } = reading;
  const phase = progress.confirmation?.phase;
  const commands: PopupAction[] = [];

  if (update && reading.updateLabel && phase !== "confirmed" && phase !== "unavailable") {
    commands.push({ id: "progress", label: reading.updateLabel,
      execute: actions.withWork(workId, () => progress.update(update, reading.saved ?? null)) });
  }
  if (reading.addSource) {
    commands.push({ id: "source", label: t("addSource"), success: t("addSourceSuccess"),
      execute: actions.withWork(workId, async () => {
        await transport.addSource({ workId, url: context.url, ...(context.siteName && { name: context.siteName }) });
        if (detail) await progress.refreshContext(createWorkContextParams(workId, context));
      }) });
  }
  if (resume) {
    const chapter = resume.chapter?.value ?? reading.saved?.value;
    commands.push({ id: "continue", label: chapter ? t("continueChapter", chapter) : t("continueReading"),
      execute: () => navigate(resume.url) });
  }
  if (capabilities.includes("work.open")) {
    commands.push({ id: "open", label: t("openWork"), success: t("openWorkSuccess"),
      execute: () => transport.openWork({ workId }) });
  }

  const verify: PopupAction = { id: "verify", label: t("progressVerifyAgain"), execute: progress.verify };
  return <ReadingView reading={reading} commands={commands} actions={actions} confirmation={
    <ProgressFeedback value={progress.confirmation} busy={actions.pending !== undefined}
      onVerify={() => void actions.run(verify)} />
  } />;
}
