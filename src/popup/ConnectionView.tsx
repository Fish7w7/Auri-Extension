import { t, type MessageKey } from "../i18n";
import type { PopupState } from "./popup-state";
import { ActionButton, PageHeading } from "./PopupShell";
import type { PopupActions } from "./use-popup-actions";

type ConnectionState = Exclude<PopupState, { status: "ready" }>;
const messages = {
  loading: ["loadingTitle", "loadingDescription"],
  desktop_unavailable: ["disconnectedTitle", "disconnectedDescription"],
  integration_unavailable: ["integrationUnavailableTitle", "integrationUnavailableDescription"],
  incompatible: ["incompatibleTitle", "incompatibleDescription"],
  error: ["errorTitle", "errorDescription"],
  unsupported: ["unsupportedTitle", "unsupportedDescription"],
} satisfies Record<ConnectionState["status"], [MessageKey, MessageKey]>;

export function ConnectionView({ state, actions, onRetry }: {
  state: ConnectionState; actions: PopupActions; onRetry: () => void | Promise<void>;
}) {
  const [title, description] = messages[state.status];
  const context = "context" in state ? state.context : undefined;
  const Heading = context ? "h2" : "h1";
  return <>
    {context && <PageHeading context={context} />}
    <section className="message-card" aria-live="polite">
      {state.status === "loading" && <span className="spinner" aria-hidden="true" />}
      {state.status === "unsupported" && <p className="eyebrow">{t("statusUnsupported")}</p>}
      <Heading>{t(title)}</Heading>
      <p>{t(description)}</p>
      {state.status !== "loading" && state.status !== "unsupported" &&
        <ActionButton actions={actions} action={{ id: "retry", label: t("retry"), execute: onRetry }} />}
    </section>
  </>;
}
