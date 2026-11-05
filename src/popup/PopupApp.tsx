import {
  PROTOCOL_VERSION,
  isKnownCapability,
  type ChapterValue,
  type DesktopOpenAddWorkParams,
  type KnownCapability,
  type PageContext,
  type UserStatus,
  type WorkContextParams,
  type WorkContextResult,
  type WorkResolveResult,
} from "@auri/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EXTENSION_VERSION } from "../config/extension";
import { readActivePage, type ActivePageResult } from "../extraction/read-active-tab";
import { t } from "../i18n";
import {
  isDesktopUnavailableFailure,
  isIncompatibleFailure,
  isNativeHostUnavailableFailure,
  TransportFailure,
  type AuriTransport,
} from "../transport/auri-transport";
import { createTransport } from "../transport/create-transport";
import { useProgressConfirmation } from "./use-progress-confirmation";
import { assertTrustedWorkIdentity, hasTrustedWorkIdentity, runWithTrustedWorkIdentity, UntrustedWorkIdentityError } from "./work-identity";
import { canUseDetectedChapter, normalizeProgressChapter } from "./progress-confirmation";
import { ProgressFeedback } from "./ProgressFeedback";
import type { PopupState } from "./popup-state";

type NavigateToUrl = (url: string) => Promise<unknown>;

interface PopupAppProps {
  transport?: AuriTransport;
  readPage?: () => Promise<ActivePageResult>;
  navigateToUrl?: NavigateToUrl;
}

export function createWorkContextParams(
  workId: string,
  context: PageContext,
): WorkContextParams {
  return {
    workId,
    page: {
      url: context.url,
      ...(context.canonicalUrl ? { canonicalUrl: context.canonicalUrl } : {}),
      ...(context.detectedChapter ? { detectedChapter: context.detectedChapter } : {}),
    },
  };
}

export async function navigateCurrentTab(url: string): Promise<void> {
  await chrome.tabs.update({ url });
}

export function PopupApp({
  transport: providedTransport,
  readPage = readActivePage,
  navigateToUrl = navigateCurrentTab,
}: PopupAppProps) {
  const transport = useMemo(() => providedTransport ?? createTransport(), [providedTransport]);
  const [state, setState] = useState<PopupState>({ status: "loading" });

  const loadSequence = useRef(0);
  const invalidateLoads = useCallback(() => { loadSequence.current += 1; }, []);

  const load = useCallback(async (preserveCurrent = false) => {
    const id = ++loadSequence.current;
    const commit = (next: PopupState) => { if (id === loadSequence.current) setState(next); };
    if (!preserveCurrent) commit({ status: "loading" });
    let context: PageContext | undefined;

    try {
      const hello = await transport.hello({
        client: { kind: "extension", name: "auri-extension", version: EXTENSION_VERSION },
        supportedProtocolVersions: [PROTOCOL_VERSION],
      });
      if (hello.protocolVersion !== PROTOCOL_VERSION) {
        commit({ status: "incompatible" });
        return;
      }
      if (id !== loadSequence.current) return;
      const capabilities = hello.capabilities.filter(isKnownCapability);
      if (!capabilities.includes("work.resolve")) {
        commit({ status: "error" });
        return;
      }

      const page = await readPage();
      if (page.status === "unsupported") {
        commit({ status: "unsupported" });
        return;
      }
      if (id !== loadSequence.current) return;
      context = page.context;
      const result = await transport.resolveWork(context);
      if (id !== loadSequence.current) return;
      const workContext = hasTrustedWorkIdentity(result) && capabilities.includes("work.context")
        ? await transport.getWorkContext(createWorkContextParams(result.work.id, context))
        : undefined;

      if (workContext && result.status === "matched" && workContext.work.id !== result.work.id) throw new TransportFailure("invalid_message");
      commit({
        status: "ready",
        context,
        result,
        capabilities,
        ...(workContext ? { workContext } : {}),
        ...(page.coverUrl ? { coverUrl: page.coverUrl } : {}),
      });
    } catch (error) {
      const withContext = context ? { context } : {};
      if (isNativeHostUnavailableFailure(error)) {
        commit({ status: "integration_unavailable", ...withContext });
      } else if (isDesktopUnavailableFailure(error)) {
        commit({ status: "desktop_unavailable", ...withContext });
      } else if (isIncompatibleFailure(error)) {
        commit({ status: "incompatible", ...withContext });
      } else {
        if (import.meta.env.DEV) console.error("Falha de comunicação com o Auri", error);
        commit({ status: "error", ...withContext });
      }
    }
  }, [readPage, transport]);

  useEffect(() => {
    void load();
    const onActivated = () => { void load(); };
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && change.url) void load();
    };
    chrome.tabs?.onActivated?.addListener(onActivated);
    chrome.tabs?.onUpdated?.addListener(onUpdated);
    return () => {
      loadSequence.current += 1;
      chrome.tabs?.onActivated?.removeListener(onActivated);
      chrome.tabs?.onUpdated?.removeListener(onUpdated);
      transport.close();
    };
  }, [load, transport]);

  return (
    <PopupView
      state={state}
      transport={transport}
      onRetry={() => load(true)}
      onActionStart={invalidateLoads}
      navigateToUrl={navigateToUrl}
    />
  );
}

interface PopupViewProps {
  state: PopupState;
  transport: AuriTransport;
  onRetry: () => void | Promise<void>;
  onActionStart?: () => void;
  onRefreshContext?: (params: WorkContextParams) => Promise<WorkContextResult>;
  navigateToUrl?: NavigateToUrl;
}

const hasCapability = (
  capabilities: KnownCapability[],
  capability: KnownCapability,
) => capabilities.includes(capability);

const formatChapter = (chapter: { value: string } | null | undefined) =>
  chapter ? t("chapterLabel", chapter.value) : t("chapterUnknown");

function PageHeading({ context }: { context: PageContext }) {
  return (
    <section className="page-context" aria-label={t("pageContextLabel")}>
      <h1>{context.title ?? t("currentPage")}</h1>
      <p>{context.siteName ?? context.domain}</p>
    </section>
  );
}

type ConnectionTone = "neutral" | "connected" | "unavailable" | "error";

function Shell({
  children,
  connection,
  tone = "neutral",
  footer,
}: {
  children: React.ReactNode;
  connection: string;
  tone?: ConnectionTone;
  footer?: React.ReactNode;
}) {
  return (
    <main className="popup-shell">
      <header className="brand-header">
        <span className="brand-lockup">
          <img src="/icons/auri-32.png" width="32" height="32" alt="" />
          <span>
            <span className="brand-name">{t("extensionName")}</span>
            <span className="version">{t("versionLabel", EXTENSION_VERSION)}</span>
          </span>
        </span>
        <span className={`connection-status connection-${tone}`}>
          <span className="status-dot" aria-hidden="true" />
          {connection}
        </span>
      </header>
      <div className="content">{children}</div>
      {footer && <footer className="source-footer">{footer}</footer>}
    </main>
  );
}

function ActionButton({
  action,
  busy,
  disabled = false,
  children,
  className = "button-primary",
}: {
  action: () => Promise<void>;
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button className={className} type="button" disabled={busy || disabled} onClick={() => void action()}>
      {busy ? t("wait") : children}
    </button>
  );
}

export function PopupView(props: PopupViewProps) {
  const transportIdentity = useRef({ value: props.transport, revision: 0 });
  if (transportIdentity.current.value !== props.transport) transportIdentity.current = { value: props.transport, revision: transportIdentity.current.revision + 1 };
  const ready = props.state.status === "ready" ? props.state : undefined;
  const identity = JSON.stringify([props.state.status, ready?.result.status === "matched" ? ready.result.work.id : null, ready?.result.status === "matched" ? ready.result.match : null, "context" in props.state ? props.state.context : null, transportIdentity.current.revision]);
  return <PopupSession key={identity} {...props} identity={identity} />;
}

function PopupSession({
  state,
  transport,
  onRetry,
  onRefreshContext,
  navigateToUrl,
  onActionStart,
  identity,
}: PopupViewProps & { identity: string }) {
  const [pending, setPending] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const actionLock = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const ready = state.status === "ready" ? state : undefined;
  const currentResolution = useRef(ready?.result);
  currentResolution.current = ready?.result;
  const progress = useProgressConfirmation({ identity, transport,
    workId: ready?.result.status === "matched" ? ready.result.work.id : "",
    resolution: ready?.result,
    context: ready?.context ?? { url: "https://invalid.example/" },
    capabilities: ready?.capabilities ?? [], readContext: onRefreshContext,
  });
  const refreshContext = progress.refreshContext;
  const navigate = navigateToUrl ?? navigateCurrentTab;

  const runAction = async (
    key: string,
    action: () => Promise<unknown>,
    success?: string,
    workId?: string,
  ) => {
    if (actionLock.current || !active.current) return;
    try {
      if (key === "progress" || key === "source") assertTrustedWorkIdentity(currentResolution.current, workId ?? "");
    } catch { setFeedback(t("possibleMatchDescription")); return; }
    actionLock.current = true;
    onActionStart?.();
    setPending(key);
    setFeedback(undefined);
    try {
      if (key === "progress" || key === "source") await runWithTrustedWorkIdentity(() => currentResolution.current, workId ?? "", action);
      else await action();
      if (active.current && success) setFeedback(success);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Ação do Auri falhou", error);
      if (active.current) setFeedback(
        error instanceof UntrustedWorkIdentityError ? t("possibleMatchDescription") :
        error instanceof TransportFailure && error.protocolError?.code === "CONFLICT"
          ? t("actionConflict")
          : t("actionFailed"),
      );
    } finally {
      actionLock.current = false;
      if (active.current) setPending(undefined);
    }
  };

  const retryButton = (
    <ActionButton disabled={Boolean(pending)}
      className="button-secondary"
      busy={pending === "retry"}
      action={() => runAction("retry", async () => onRetry())}
    >
      {t("retry")}
    </ActionButton>
  );

  if (state.status === "loading") {
    return (
      <Shell connection={t("statusLoading")}>
        <section className="loading" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <h1>{t("loadingTitle")}</h1>
          <p>{t("loadingDescription")}</p>
        </section>
      </Shell>
    );
  }

  if (state.status === "unsupported") {
    return (
      <Shell connection={t("statusUnsupported")}>
        <section className="message-state">
          <p className="eyebrow">{t("unsupportedEyebrow")}</p>
          <h1>{t("unsupportedTitle")}</h1>
          <p>{t("unsupportedDescription")}</p>
        </section>
      </Shell>
    );
  }

  if (state.status === "desktop_unavailable") {
    return (
      <Shell connection={t("statusDisconnected")} tone="unavailable">
        {state.context && <PageHeading context={state.context} />}
        <section className="message-state separated">
          <p className="eyebrow">{t("disconnectedEyebrow")}</p>
          <h1>{t("disconnectedTitle")}</h1>
          <p>{t("disconnectedDescription")}</p>
          {retryButton}
        </section>
      </Shell>
    );
  }

  if (state.status === "integration_unavailable") {
    return (
      <Shell connection={t("statusIntegrationUnavailable")} tone="unavailable">
        {state.context && <PageHeading context={state.context} />}
        <section className="message-state separated">
          <p className="eyebrow">{t("integrationUnavailableEyebrow")}</p>
          <h1>{t("integrationUnavailableTitle")}</h1>
          <p>{t("integrationUnavailableDescription")}</p>
          {retryButton}
        </section>
      </Shell>
    );
  }

  if (state.status === "incompatible") {
    return (
      <Shell connection={t("statusIncompatible")} tone="error">
        {state.context && <PageHeading context={state.context} />}
        <section className="message-state separated">
          <p className="eyebrow">{t("incompatibleEyebrow")}</p>
          <h1>{t("incompatibleTitle")}</h1>
          <p>{t("incompatibleDescription")}</p>
          {retryButton}
        </section>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell connection={t("statusError")} tone="error">
        {state.context && <PageHeading context={state.context} />}
        <section className="message-state separated">
          <p className="eyebrow">{t("errorEyebrow")}</p>
          <h1>{t("errorTitle")}</h1>
          <p>{t("errorDescription")}</p>
          {retryButton}
          {feedback && <p className="feedback" role="status">{feedback}</p>}
        </section>
      </Shell>
    );
  }

  const { context, result: initialResult, capabilities, coverUrl } = state;
  const result = progress.observed?.kind === "resolve" ? progress.observed.result : initialResult;
  const workContext = progress.observed?.kind === "context" ? progress.observed.result : state.workContext;
  const progressFeedback = <ProgressFeedback value={progress.confirmation} busy={Boolean(pending)} onVerify={() => void runAction("verify-progress", progress.verify)} />;
  const canSendProgress = progress.confirmation?.phase !== "unavailable" && progress.confirmation?.phase !== "confirmed";
  const actionFeedback = feedback ? <p className="feedback" role="status">{feedback}</p> : null;

  if (result.status === "not_found") {
    const draft: DesktopOpenAddWorkParams = {
      pageUrl: context.url,
      ...(context.title ? { title: context.title } : {}),
      ...(context.canonicalUrl ? { canonicalUrl: context.canonicalUrl } : {}),
      ...(context.detectedChapter ? { detectedChapter: context.detectedChapter } : {}),
      ...(context.siteName ? { sourceName: context.siteName } : {}),
      ...(coverUrl && hasCapability(capabilities, "desktop.openAddWork.coverUrl")
        ? { coverUrl }
        : {}),
    };
    const canAdd = hasCapability(capabilities, "desktop.openAddWork");

    return (
      <Shell connection={t("statusConnected")} tone="connected">
        <PageHeading context={context} />
        <section className="message-state separated">
          <p className="eyebrow">{t("notFoundEyebrow")}</p>
          <h2>{t("notFoundTitle")}</h2>
          {context.detectedChapter && <p>{t("detectedChapter", formatChapter(context.detectedChapter))}</p>}
          {canAdd && (
            <ActionButton disabled={Boolean(pending)}
              busy={pending === "add-work"}
              action={() => runAction("add-work", () => transport.openAddWork(draft), t("addWorkSuccess"))}
            >
              {t("addWork")}
            </ActionButton>
          )}
          {actionFeedback}
        </section>
      </Shell>
    );
  }

  if (result.status === "ambiguous") {
    return (
      <Shell connection={t("statusConnected")} tone="connected">
        <PageHeading context={context} />
        <section className="message-state separated">
          <p className="eyebrow">{t("ambiguousEyebrow")}</p>
          <h2>{t("ambiguousTitle")}</h2>
          <p>{t("ambiguousDescription")}</p>
          <ul className="candidate-list">
            {result.candidates.map(({ work }) => (
              <li key={work.id}>
                <span><strong>{work.title}</strong><small>{t("currentChapter", formatChapter(work.currentChapter))}</small></span>
                {hasCapability(capabilities, "work.open") && (
                  <ActionButton disabled={Boolean(pending)}
                    className="button-quiet"
                    busy={pending === work.id}
                    action={() => runAction(work.id, () => transport.openWork({ workId: work.id }), t("openWorkNamedSuccess", work.title))}
                  >
                    {t("open")}
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
          {actionFeedback}
        </section>
      </Shell>
    );
  }

  if (!hasTrustedWorkIdentity(result)) {
    return (
      <Shell connection={t("statusConnected")} tone="connected">
        <PageHeading context={context} />
        <section className="message-state separated">
          <p className="eyebrow">{t("possibleMatchEyebrow")}</p>
          <h2>{t("possibleMatchTitle")}</h2>
          <p>{t("possibleMatchDescription")}</p>
          <p><strong>{result.work.title}</strong></p>
          {hasCapability(capabilities, "work.open") && (
            <ActionButton disabled={Boolean(pending)} busy={pending === "open"} className="button-secondary"
              action={() => runAction("open", () => transport.openWork({ workId: result.work.id }), t("openWorkSuccess"))}>
              {t("possibleMatchOpen")}
            </ActionButton>
          )}
          {actionFeedback}
        </section>
      </Shell>
    );
  }

  if (workContext) {
    return (
      <ReadingContextView
        context={context}
        result={workContext}
        capabilities={capabilities}
        transport={transport}
        pending={pending}
        feedback={actionFeedback}
        progressFeedback={progressFeedback}
        canSendProgress={canSendProgress}
        updateProgress={progress.update}
        runAction={runAction}
        refreshContext={refreshContext}
        navigateToUrl={navigate}
      />
    );
  }

  return (
    <LegacyMatchedView
      context={context}
      result={result as Extract<WorkResolveResult, { status: "matched" }>}
      capabilities={capabilities}
      transport={transport}
      pending={pending}
      feedback={actionFeedback}
      progressFeedback={progressFeedback}
      canSendProgress={canSendProgress}
      updateProgress={progress.update}
      runAction={runAction}
    />
  );
}

function formatUserStatus(status: UserStatus): string {
  switch (status) {
    case "want_to_read": return t("userStatusWantToRead");
    case "reading": return t("userStatusReading");
    case "paused": return t("userStatusPaused");
    case "waiting": return t("userStatusWaiting");
    case "completed": return t("userStatusCompleted");
    case "dropped": return t("userStatusDropped");
  }
}

function formatSourceStatus(state: WorkContextResult["source"]["state"]): string {
  switch (state) {
    case "linked": return t("sourceLinked");
    case "unlinked": return t("sourceUnlinked");
    case "ambiguous": return t("sourceAmbiguous");
  }
}

function toChapterValue(chapter: NonNullable<WorkContextResult["page"]["detectedChapter"]>): ChapterValue {
  return {
    value: chapter.value,
    ...(chapter.numericValue === undefined ? {} : { numericValue: chapter.numericValue }),
  };
}

function ReadingContextView({
  context,
  result,
  capabilities,
  transport,
  pending,
  feedback,
  progressFeedback,
  canSendProgress,
  updateProgress,
  runAction,
  refreshContext,
  navigateToUrl,
}: {
  context: PageContext;
  result: WorkContextResult;
  capabilities: KnownCapability[];
  transport: AuriTransport;
  pending?: string;
  feedback: React.ReactNode;
  progressFeedback: React.ReactNode;
  canSendProgress: boolean;
  updateProgress: ReturnType<typeof useProgressConfirmation>["update"];
  runAction: (key: string, action: () => Promise<unknown>, success?: string, workId?: string) => Promise<void>;
  refreshContext: (params: WorkContextParams) => Promise<WorkContextResult>;
  navigateToUrl: NavigateToUrl;
}) {
  const { work, page, source, continueTarget } = result;
  const sourceName = source.name ?? source.domain ?? context.siteName ?? context.domain;
  const linkedSourceId = source.state === "linked" ? source.matchedSourceId : undefined;
  const updateChapter = page.detectedChapter && canUseDetectedChapter(page.detectedChapter) && (
    page.relation === "ahead" || work.progress === null
  ) ? page.detectedChapter : undefined;
  const canUpdate = Boolean(
    updateChapter &&
    linkedSourceId &&
    hasCapability(capabilities, "progress.update"),
  );
  const canAddSource = source.state === "unlinked" && hasCapability(capabilities, "source.add");
  const targetIsCurrentPage = continueTarget?.url === context.url ||
    Boolean(context.canonicalUrl && continueTarget?.url === context.canonicalUrl);
  const canContinue = Boolean(
    continueTarget && !targetIsCurrentPage && source.state !== "ambiguous",
  );
  const refreshParams = createWorkContextParams(work.id, context);
  const continueChapter = continueTarget?.chapter?.value ?? work.progress?.value;
  const relationMessage = work.progress === null
    ? t("noProgress")
    : page.relation === "same"
      ? t("upToDate")
      : page.relation === "series_page" || page.relation === "behind"
        ? t("stoppedAtChapter", work.progress.value)
        : undefined;

  const update = updateChapter && linkedSourceId
    ? () => runAction("progress", () => updateProgress({
        workId: work.id, chapter: toChapterValue(updateChapter), pageUrl: context.url, sourceId: linkedSourceId,
      }, work.progress), undefined, work.id)
    : undefined;

  const addSource = () => runAction(
    "source",
    async () => {
      await transport.addSource({
        workId: work.id,
        url: context.url,
        ...(context.siteName ? { name: context.siteName } : {}),
      });
      await refreshContext(refreshParams);
    },
    t("addSourceSuccess"), work.id,
  );

  const footer = (
    <>
      <strong>{sourceName}</strong>
      <span aria-hidden="true">{"·"}</span>
      <span>{formatSourceStatus(source.state)}</span>
    </>
  );

  return (
    <Shell connection={t("statusConnected")} tone="connected" footer={footer}>
      <section className="work-header" aria-label={t("workContextLabel")}>
        <h1>{work.title}</h1>
        <p>{formatUserStatus(work.userStatus)}</p>
      </section>

      <section className="progress-card" aria-label={t("progressLabel")}>
        <div>
          <span>{t("savedProgressLabel")}</span>
          <strong>{formatChapter(work.progress)}</strong>
        </div>
        <div>
          <span>{t("progressPage")}</span>
          <strong>{formatChapter(page.detectedChapter)}</strong>
        </div>
        {relationMessage && <p className="progress-summary">{relationMessage}</p>}
        {progressFeedback}
      </section>

      {source.state === "unlinked" && (
        <p className="source-message">{t("sourceUnlinkedDescription")}</p>
      )}
      {source.state === "ambiguous" && (
        <p className="source-message">{t("sourceAmbiguousDescription")}</p>
      )}

      <div className="actions">
        {canSendProgress && canUpdate && updateChapter && update && (
          <ActionButton disabled={Boolean(pending)} busy={pending === "progress"} action={update}>
            {work.progress === null
              ? t("markChapter", updateChapter.value)
              : t("updateProgress", updateChapter.value)}
          </ActionButton>
        )}
        {canAddSource && (
          <ActionButton disabled={Boolean(pending)} busy={pending === "source"} action={addSource}>
            {t("addSource")}
          </ActionButton>
        )}
        {canContinue && continueTarget && (
          <ActionButton disabled={Boolean(pending)}
            className={canUpdate || canAddSource ? "button-secondary" : "button-primary"}
            busy={pending === "continue"}
            action={() => runAction("continue", () => navigateToUrl(continueTarget.url))}
          >
            {continueChapter
              ? t("continueChapter", continueChapter)
              : t("continueReading")}
          </ActionButton>
        )}
        {hasCapability(capabilities, "work.open") && (
          <ActionButton disabled={Boolean(pending)}
            className="button-secondary"
            busy={pending === "open"}
            action={() => runAction("open", () => transport.openWork({ workId: work.id }), t("openWorkSuccess"))}
          >
            {t("openWork")}
          </ActionButton>
        )}
      </div>
      {feedback}
    </Shell>
  );
}

function LegacyMatchedView({
  context,
  result,
  capabilities,
  transport,
  pending,
  feedback,
  progressFeedback,
  canSendProgress,
  updateProgress,
  runAction,
}: {
  context: PageContext;
  result: Extract<WorkResolveResult, { status: "matched" }>;
  capabilities: KnownCapability[];
  transport: AuriTransport;
  pending?: string;
  feedback: React.ReactNode;
  progressFeedback: React.ReactNode;
  canSendProgress: boolean;
  updateProgress: ReturnType<typeof useProgressConfirmation>["update"];
  runAction: (key: string, action: () => Promise<unknown>, success?: string, workId?: string) => Promise<void>;
}) {
  const detected = context.detectedChapter;
  const current = result.work.currentChapter;
  const detectedValue = normalizeProgressChapter(detected);
  const currentValue = normalizeProgressChapter(current);
  const updateChapter = detected && canUseDetectedChapter(detected) && detectedValue?.kind === "numeric" &&
    (current == null || (currentValue?.kind === "numeric" && detectedValue.value > currentValue.value))
      ? toChapterValue(detected)
      : undefined;
  const canUpdate = Boolean(updateChapter && hasCapability(capabilities, "progress.update"));

  return (
    <Shell connection={t("statusConnected")} tone="connected">
      <PageHeading context={{ ...context, title: result.work.title }} />
      <section className="matched-status separated">
        <p className="eyebrow">{t("inLibrary")}</p>
        {result.source && (
          <p className="source-line"><span>{t("sourceRecognized")}</span><strong>{result.source.name ?? result.source.domain}</strong></p>
        )}
        <div className="progress-grid" aria-label={t("progressLabel")}>
          <div><span>{t("progressCurrent")}</span><strong>{formatChapter(current)}</strong></div>
          <div><span>{t("progressPage")}</span><strong>{formatChapter(detected)}</strong></div>
        </div>
        {detectedValue?.kind === "numeric" &&
          currentValue?.kind === "numeric" &&
          detectedValue.value < currentValue.value && (
          <p className="hint">{t("previousChapterHint")}</p>
        )}
        {progressFeedback}
        <div className="actions">
          {canSendProgress && canUpdate && updateChapter && (
            <ActionButton disabled={Boolean(pending)}
              busy={pending === "progress"}
              action={() => runAction("progress", () => updateProgress({
                workId: result.work.id, chapter: updateChapter,
                ...(result.source ? { sourceId: result.source.id } : {}), pageUrl: context.url,
              }, current ?? null), undefined, result.work.id)}
            >
              {t("updateProgress", updateChapter.value)}
            </ActionButton>
          )}
          {hasCapability(capabilities, "work.open") && (
            <ActionButton disabled={Boolean(pending)}
              className={canUpdate ? "button-secondary" : "button-primary"}
              busy={pending === "open"}
              action={() => runAction("open", () => transport.openWork({ workId: result.work.id }), t("openWorkSuccess"))}
            >
              {t("openWork")}
            </ActionButton>
          )}
          {!result.source && hasCapability(capabilities, "source.add") && (
            <ActionButton disabled={Boolean(pending)}
              className="button-secondary"
              busy={pending === "source"}
              action={() => runAction(
                "source",
                () => transport.addSource({ workId: result.work.id, url: context.url, name: context.siteName }),
                t("addSourceSuccess"), result.work.id,
              )}
            >
              {t("addSource")}
            </ActionButton>
          )}
        </div>
        {feedback}
      </section>
    </Shell>
  );
}
