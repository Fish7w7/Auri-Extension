import {
  PROTOCOL_VERSION,
  isKnownCapability,
  type KnownCapability,
  type DesktopOpenAddWorkParams,
  type PageContext,
  type WorkResolveResult,
} from "@auri/protocol";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EXTENSION_VERSION } from "../config/extension";
import { readActivePage, type ActivePageResult } from "../extraction/read-active-tab";
import { t } from "../i18n";
import {
  isDesktopUnavailableFailure,
  isIncompatibleFailure,
  TransportFailure,
  type AuriTransport,
} from "../transport/auri-transport";
import { createTransport } from "../transport/create-transport";
import type { PopupState } from "./popup-state";

interface PopupAppProps {
  transport?: AuriTransport;
  readPage?: () => Promise<ActivePageResult>;
}

export function PopupApp({
  transport: providedTransport,
  readPage = readActivePage,
}: PopupAppProps) {
  const transport = useMemo(() => providedTransport ?? createTransport(), [providedTransport]);
  const [state, setState] = useState<PopupState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const page = await readPage();
    if (page.status === "unsupported") {
      setState({ status: "unsupported" });
      return;
    }

    try {
      const hello = await transport.hello({
        client: { kind: "extension", name: "auri-extension", version: EXTENSION_VERSION },
        supportedProtocolVersions: [PROTOCOL_VERSION],
      });
      if (hello.protocolVersion !== PROTOCOL_VERSION) {
        setState({ status: "incompatible", context: page.context });
        return;
      }
      const capabilities = hello.capabilities.filter(isKnownCapability);
      if (!capabilities.includes("work.resolve")) {
        setState({ status: "error", context: page.context });
        return;
      }

      const result = await transport.resolveWork(page.context);
      setState({
        status: "ready",
        context: page.context,
        result,
        capabilities,
        ...(page.coverUrl ? { coverUrl: page.coverUrl } : {}),
      });
    } catch (error) {
      if (isDesktopUnavailableFailure(error)) {
        setState({ status: "disconnected", context: page.context });
      } else if (isIncompatibleFailure(error)) {
        setState({ status: "incompatible", context: page.context });
      } else {
        if (import.meta.env.DEV) console.error("Falha de comunicação com o Auri", error);
        setState({ status: "error", context: page.context });
      }
    }
  }, [readPage, transport]);

  useEffect(() => {
    void load();
    return () => transport.close();
  }, [load]);

  return <PopupView state={state} transport={transport} onRetry={load} />;
}

interface PopupViewProps {
  state: PopupState;
  transport: AuriTransport;
  onRetry: () => void | Promise<void>;
}

const hasCapability = (
  capabilities: KnownCapability[],
  capability: KnownCapability,
) =>
  capabilities.includes(capability);

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

function Shell({ children, connection }: { children: React.ReactNode; connection: string }) {
  return (
    <main className="popup-shell">
      <header className="brand-header">
        <span className="brand-lockup">
          <img src="/icons/auri-32.png" width="32" height="32" alt="" />
          <span className="brand-name">{t("extensionName")}</span>
        </span>
        <span className="version">{t("versionLabel", EXTENSION_VERSION)}</span>
      </header>
      <div className="content">{children}</div>
      <footer><span className="status-dot" aria-hidden="true" />{connection}</footer>
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

export function PopupView({ state, transport, onRetry }: PopupViewProps) {
  const [pending, setPending] = useState<string>();
  const [feedback, setFeedback] = useState<string>();

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    setPending(key);
    setFeedback(undefined);
    try {
      await action();
      setFeedback(success);
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

  if (state.status === "loading") {
    return (
      <Shell connection={t("statusLoading")}>
        <section className="loading" aria-live="polite">
          <span className="loading-line" aria-hidden="true" />
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

  if (state.status === "disconnected") {
    return (
      <Shell connection={t("statusDisconnected")}>
        <PageHeading context={state.context} />
        <section className="message-state separated">
          <p className="eyebrow">{t("disconnectedEyebrow")}</p>
          <h2>{t("disconnectedTitle")}</h2>
          <p>{t("disconnectedDescription")}</p>
          <button className="button-primary" type="button" onClick={() => void onRetry()}>
            {t("retry")}
          </button>
        </section>
      </Shell>
    );
  }

  if (state.status === "incompatible") {
    return (
      <Shell connection={t("statusIncompatible")}>
        <PageHeading context={state.context} />
        <section className="message-state separated">
          <p className="eyebrow">{t("incompatibleEyebrow")}</p>
          <h2>{t("incompatibleTitle")}</h2>
          <p>{t("incompatibleDescription")}</p>
          <button className="button-primary" type="button" onClick={() => void onRetry()}>
            {t("retry")}
          </button>
        </section>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell connection={t("statusError")}>
        {state.context && <PageHeading context={state.context} />}
        <section className="message-state separated">
          <p className="eyebrow">{t("errorEyebrow")}</p>
          <h2>{t("errorTitle")}</h2>
          <p>{t("errorDescription")}</p>
          <button className="button-primary" type="button" onClick={() => void onRetry()}>
            {t("retry")}
          </button>
        </section>
      </Shell>
    );
  }

  const { context, result, capabilities, coverUrl } = state;
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
      <Shell connection={t("statusConnected")}>
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
      <Shell connection={t("statusConnected")}>
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

  return (
    <MatchedView
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

function MatchedView({
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
  runAction: (key: string, action: () => Promise<unknown>, success: string) => Promise<void>;
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
    <Shell connection={t("statusConnected")}>
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
