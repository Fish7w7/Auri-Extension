import type { ReactNode } from "react";
import type { PageContext } from "@auri/protocol";
import { EXTENSION_VERSION } from "../config/extension";
import { t, type MessageKey } from "../i18n";
import type { PopupState } from "./popup-state";
import type { ActionFeedbackValue, PopupAction, PopupActions } from "./use-popup-actions";

const paths = {
  book: "M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z M12 6v14",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  page: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h5",
  link: "M9 15l6-6 M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2 M11 8l2-2a3.5 3.5 0 0 1 5 5l-2 2",
  check: "M4 12l5 5L20 6",
  offline: "M8 8l8 8 M16 8l-8 8",
  info: "M12 10v6 M12 7v.1 M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0",
  clock: "M12 6v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0",
  forward: "M4 12h15 M14 6l6 6-6 6",
  back: "M20 12H5 M10 6l-6 6 6 6",
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}

const connections = {
  loading: ["statusLoading", "clock"],
  ready: ["statusConnected", "check"],
  unsupported: ["statusConnected", "check"],
  desktop_unavailable: ["statusDisconnected", "offline"],
  integration_unavailable: ["statusIntegrationUnavailable", "info"],
  incompatible: ["statusIncompatible", "info"],
  error: ["statusError", "info"],
} satisfies Record<PopupState["status"], [MessageKey, keyof typeof paths]>;

export function PopupShell({ status, children }: { status: PopupState["status"]; children: ReactNode }) {
  const [label, icon] = connections[status];
  return (
    <main className="popup-shell">
      <header className="brand-header">
        <div className="brand-lockup">
          <img src="/icons/auri-48.png" alt="" width="36" height="36" />
          <span className="brand-name">{t("extensionName")}</span>
          <small className="version">{t("versionLabel", EXTENSION_VERSION)}</small>
        </div>
        <span className={`connection connection--${icon}`}><Icon name={icon} />{t(label)}</span>
      </header>
      <div className="content">{children}</div>
    </main>
  );
}

export function PageHeading({ context }: { context: PageContext }) {
  return <section className="page-context" aria-label={t("pageContextLabel")}>
    <p className="meta"><Icon name="page" />{context.siteName ?? context.domain ?? t("currentPage")}</p>
    <h1>{context.title ?? t("currentPage")}</h1>
  </section>;
}

export function ActionButton({ action, actions, secondary = false }: {
  action: PopupAction; actions: PopupActions; secondary?: boolean;
}) {
  const busy = actions.pending === action.id;
  return <button type="button" className={secondary ? "button-secondary" : "button-primary"}
    disabled={actions.pending !== undefined} aria-busy={busy} onClick={() => void actions.run(action)}>
    {busy && <span className="spinner" aria-hidden="true" />}
    {busy ? t("wait") : action.label}
  </button>;
}

export function ActionFeedback({ feedback }: { feedback?: ActionFeedbackValue }) {
  if (!feedback) return null;
  return <p role="status" className={`feedback feedback--${feedback.kind}`}>
    <Icon name={feedback.kind === "success" ? "check" : "info"} />{feedback.message}
  </p>;
}
