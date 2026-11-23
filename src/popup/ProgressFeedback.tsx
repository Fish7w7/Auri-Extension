import { t } from "../i18n";
import { formatChapter } from "./reading-model";
import type { ProgressConfirmation } from "./use-progress-confirmation";

function feedbackTitle(value: ProgressConfirmation) {
  switch (value.phase) {
    case "updating": return t("progressUpdating");
    case "confirming": return t("progressConfirming");
    case "confirmed": return t("progressConfirmed");
    case "divergent": return t("progressDivergent");
    case "failed": return t(value.reason === "invalid_request" ? "progressInvalidRequestTitle" : "progressRejectedTitle");
    case "unavailable": return t(value.reason === "communication" ? "progressConnectionUnconfirmed" : "progressUnconfirmed");
  }
}

function feedbackMessage(value: ProgressConfirmation) {
  switch (value.phase) {
    case "confirmed": return value.saved && t("progressConfirmedDescription", value.saved.value);
    case "divergent": return value.saved ? t("progressMismatch", [value.requested.value, value.saved.value])
      : t("progressMissing", value.requested.value);
    case "failed":
      if (value.reason === "invalid_request") return t("progressInvalidRequest");
      return t(value.reason === "conflict" ? "actionConflict" : "progressRejected");
    case "unavailable":
      if (value.reason === "communication") return t("progressConnectionInterrupted");
      return t(value.delivery === "accepted" ? "progressSentUnconfirmed" : "progressUncertain");
  }
}

export function ProgressFeedback({ value, busy, onVerify }: {
  value?: ProgressConfirmation; busy: boolean; onVerify(): void;
}) {
  const pending = value?.phase === "updating" || value?.phase === "confirming";
  return (
    <section role="status" aria-live="polite" aria-atomic="true"
      className={value && `progress-confirmation progress-confirmation--${value.phase}`}>
      {value && <>
        <strong>{feedbackTitle(value)}</strong>
        {!pending && <>
          <dl>
            <div><dt>{t("progressPrevious")}</dt><dd>{formatChapter(value.previous)}</dd></div>
            {value.saved !== undefined && <div><dt>{t("progressSaved")}</dt><dd>{formatChapter(value.saved)}</dd></div>}
          </dl>
          <p>{feedbackMessage(value)}</p>
          {value.reason === "different_work" && <p>{t("progressWrongWork")}</p>}
          {value.reason === "untrusted_identity" && <p>{t("progressWeakIdentity")}</p>}
          {value.reason === "invalid_progress" && <p>{t("progressInvalidEvidence")}</p>}
          {(value.phase === "divergent" || value.phase === "unavailable") &&
            <button type="button" className="button-secondary" disabled={busy} onClick={onVerify}>{t("progressVerifyAgain")}</button>}
        </>}
      </>}
    </section>
  );
}
