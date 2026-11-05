import type { ChapterValue } from "@auri/protocol";
import { t } from "../i18n";
import type { ProgressConfirmation } from "./use-progress-confirmation";

const chapterLabel = (chapter: ChapterValue | null | undefined) => chapter ? t("chapterLabel", chapter.value) : t("chapterUnknown");
export function ProgressFeedback({ value, busy, onVerify }: { value?: ProgressConfirmation; busy: boolean; onVerify(): void }) {
  // The announcement target exists before the action; busy belongs to the controls, not this live region.
  if (!value) return <section className="progress-announcer" role="status" aria-live="polite" aria-atomic="true" />;
  const pending = value.phase === "updating" || value.phase === "confirming";
  const title = value.phase === "updating" ? t("progressUpdating") : value.phase === "confirming" ? t("progressConfirming")
    : value.phase === "confirmed" ? t("progressConfirmed") : value.phase === "divergent" ? t("progressDivergent")
      : value.phase === "failed" ? value.reason === "invalid_request" ? t("progressInvalidRequestTitle") : t("progressRejectedTitle") : value.reason === "communication" ? t("progressConnectionUnconfirmed") : t("progressUnconfirmed");
  const message = value.phase === "confirmed" && value.saved ? t("progressConfirmedDescription", value.saved.value)
    : value.phase === "divergent" ? value.saved ? t("progressMismatch", [value.requested.value, value.saved.value]) : t("progressMissing", value.requested.value)
      : value.phase === "failed" ? value.reason === "invalid_request" ? t("progressInvalidRequest") : value.reason === "conflict" ? t("actionConflict") : t("progressRejected")
        : value.reason === "communication" ? t("progressConnectionInterrupted")
        : value.delivery === "accepted" ? t("progressSentUnconfirmed") : t("progressUncertain");
  return <section className={`progress-confirmation progress-confirmation--${value.phase}`} role="status" aria-live="polite" aria-atomic="true">
    <strong>{title}</strong>
    {!pending && <>
      <dl><div><dt>{t("progressPrevious")}</dt><dd>{chapterLabel(value.previous)}</dd></div>
        {value.saved !== undefined && <div><dt>{t("progressSaved")}</dt><dd>{chapterLabel(value.saved)}</dd></div>}</dl>
      <p>{message}</p>
      {value.reason === "different_work" && <p>{t("progressWrongWork")}</p>}
      {value.reason === "untrusted_identity" && <p>{t("progressWeakIdentity")}</p>}
      {value.reason === "invalid_progress" && <p>{t("progressInvalidEvidence")}</p>}
      {(value.phase === "divergent" || value.phase === "unavailable") && <button type="button" className="button-secondary" disabled={busy} onClick={onVerify}>{t("progressVerifyAgain")}</button>}
    </>}
  </section>;
}
