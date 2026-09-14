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
import { useCallback, useEffect, useMemo, useState } from "react";

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

  const load = useCallback(async (preserveCurrent = false) => {
    if (!preserveCurrent) setState({ status: "loading" });
    let context: PageContext | undefined;

    try {
      const hello = await transport.hello({
        client: { kind: "extension", name: "auri-extension", version: EXTENSION_VERSION },
        supportedProtocolVersions: [PROTOCOL_VERSION],
      });
      if (hello.protocolVersion !== PROTOCOL_VERSION) {
        setState({ status: "incompatible" });
        return;
      }
      const capabilities = hello.capabilities.filter(isKnownCapability);
      if (!capabilities.includes("work.resolve")) {
        setState({ status: "error" });
        return;
      }

      const page = await readPage();
      if (page.status === "unsupported") {
        setState({ status: "unsupported" });
        return;
      }
      context = page.context;
      const result = await transport.resolveWork(context);
      const workContext = result.status === "matched" && capabilities.includes("work.context")
        ? await transport.getWorkContext(createWorkContextParams(result.work.id, context))
        : undefined;

      setState({
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
        setState({ status: "integration_unavailable", ...withContext });
      } else if (isDesktopUnavailableFailure(error)) {
        setState({ status: "desktop_unavailable", ...withContext });
      } else if (isIncompatibleFailure(error)) {
        setState({ status: "incompatible", ...withContext });
      } else {
        if (import.meta.env.DEV) console.error("Falha de comunicação com o Auri", error);
        setState({ status: "error", ...withContext });
      }
    }
  }, [readPage, transport]);

  const refreshWorkContext = useCallback(async (params: WorkContextParams) => {
    const workContext = await transport.getWorkContext(params);
    setState((current) => current.status === "ready"
      ? { ...current, workContext }
      : current);
    return workContext;
  }, [transport]);

  useEffect(() => {
    void load();
    return () => transport.close();
  }, [load, transport]);

  return (
    <PopupView
      state={state}
      transport={transport}
      onRetry={() => load(true)}
      onRefreshContext={refreshWorkContext}
      navigateToUrl={navigateToUrl}
    />
  );
}

interface PopupViewProps {
  state: PopupState;
  transport: AuriTransport;
  onRetry: () => void | Promise<void>;
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
  children,
  className = "button-primary",
}: {
  action: () => Promise<void>;
  busy: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button className={className} type="button" disabled={busy} onClick={() => void action()}>
      {busy ? t("wait") : children}
    </button>
  );
}

export function PopupView({
  state,
  transport,
  onRetry,
  onRefreshContext,
  navigateToUrl,
}: PopupViewProps) {
  const [pending, setPending] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const refreshContext = onRefreshContext ?? ((params: WorkContextParams) =>
    transport.getWorkContext(params));
  const navigate = navigateToUrl ?? navigateCurrentTab;

  const runAction = async (
    key: string,
    action: () => Promise<unknown>,
    success?: string,
  ) => {
    setPending(key);
    setFeedback(undefined);
    try {
      await action();
      if (success) setFeedback(success);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Ação do Auri falhou", error);
      setFeedback(
        error instanceof TransportFailure && error.protocolError?.code === "CONFLICT"
          ? t("actionConflict")
          : t("actionFailed"),
      );
    } finally {
      setPending(undefined);
    }
  };

  const retryButton = (
    <ActionButton
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

  const { context, result, capabilities, coverUrl, workContext } = state;
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
            <ActionButton
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
                  <ActionButton
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

  if (workContext) {
    return (
      <ReadingContextView
        context={context}
        result={workContext}
        capabilities={capabilities}
        transport={transport}
        pending={pending}
        feedback={actionFeedback}
        runAction={runAction}
        refreshContext={refreshContext}
        navigateToUrl={navigate}
      />
    );
  }

  return (
    <LegacyMatchedView
      context={context}
      result={result}
      capabilities={capabilities}
      transport={transport}
      pending={pending}
      feedback={actionFeedback}
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
  runAction: (key: string, action: () => Promise<unknown>, success?: string) => Promise<void>;
  refreshContext: (params: WorkContextParams) => Promise<WorkContextResult>;
  navigateToUrl: NavigateToUrl;
}) {
  const { work, page, source, continueTarget } = result;
  const sourceName = source.name ?? source.domain ?? context.siteName ?? context.domain;
  const linkedSourceId = source.state === "linked" ? source.matchedSourceId : undefined;
  const updateChapter = page.detectedChapter && (
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
    ? () => runAction(
        "progress",
        async () => {
          await transport.updateProgress({
            workId: work.id,
            chapter: toChapterValue(updateChapter),
            pageUrl: context.url,
            sourceId: linkedSourceId,
          });
          await refreshContext(refreshParams);
        },
        t("updateProgressSuccess", updateChapter.value),
      )
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
    t("addSourceSuccess"),
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
      </section>

      {source.state === "unlinked" && (
        <p className="source-message">{t("sourceUnlinkedDescription")}</p>
      )}
      {source.state === "ambiguous" && (
        <p className="source-message">{t("sourceAmbiguousDescription")}</p>
      )}

      <div className="actions">
        {canUpdate && updateChapter && update && (
          <ActionButton busy={pending === "progress"} action={update}>
            {work.progress === null
              ? t("markChapter", updateChapter.value)
              : t("updateProgress", updateChapter.value)}
          </ActionButton>
        )}
        {canAddSource && (
          <ActionButton busy={pending === "source"} action={addSource}>
            {t("addSource")}
          </ActionButton>
        )}
        {canContinue && continueTarget && (
          <ActionButton
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
          <ActionButton
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
  runAction,
}: {
  context: PageContext;
  result: Extract<WorkResolveResult, { status: "matched" }>;
  capabilities: KnownCapability[];
  transport: AuriTransport;
  pending?: string;
  feedback: React.ReactNode;
  runAction: (key: string, action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const detected = context.detectedChapter;
  const current = result.work.currentChapter;
  const updateChapter =
    detected?.confidence !== "low" &&
    detected?.numericValue !== undefined &&
    (current?.numericValue === undefined || detected.numericValue > current.numericValue)
      ? { value: detected.value, numericValue: detected.numericValue }
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
        {detected?.numericValue !== undefined &&
          current?.numericValue !== undefined &&
          detected.numericValue < current.numericValue && (
          <p className="hint">{t("previousChapterHint")}</p>
        )}
        <div className="actions">
          {canUpdate && updateChapter && (
            <ActionButton
              busy={pending === "progress"}
              action={() => runAction(
                "progress",
                () => transport.updateProgress({
                  workId: result.work.id,
                  chapter: updateChapter,
                  ...(result.source ? { sourceId: result.source.id } : {}),
                  pageUrl: context.url,
                }),
                t("updateProgressSuccess", updateChapter.value),
              )}
            >
              {t("updateProgress", updateChapter.value)}
            </ActionButton>
          )}
          {hasCapability(capabilities, "work.open") && (
            <ActionButton
              className={canUpdate ? "button-secondary" : "button-primary"}
              busy={pending === "open"}
              action={() => runAction("open", () => transport.openWork({ workId: result.work.id }), t("openWorkSuccess"))}
            >
              {t("openWork")}
            </ActionButton>
          )}
          {!result.source && hasCapability(capabilities, "source.add") && (
            <ActionButton
              className="button-secondary"
              busy={pending === "source"}
              action={() => runAction(
                "source",
                () => transport.addSource({ workId: result.work.id, url: context.url, name: context.siteName }),
                t("addSourceSuccess"),
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
