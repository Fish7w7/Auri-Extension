import type { ChapterValue, PageContext, ProgressUpdateParams, WorkContextResult } from "@auri/protocol";
import { t, type MessageKey } from "../i18n";
import type { ReadyState } from "./popup-state";
import { canUseDetectedChapter, normalizeProgressChapter } from "./progress-confirmation";
import type { TrustedWorkMatch } from "./work-identity";

type Relation = WorkContextResult["page"]["relation"];
export const formatChapter = (chapter?: ChapterValue | null) =>
  chapter ? t("chapterLabel", chapter.value) : t("chapterUnknown");

const statusLabels = {
  want_to_read: "userStatusWantToRead", reading: "userStatusReading", paused: "userStatusPaused",
  waiting: "userStatusWaiting", completed: "userStatusCompleted", dropped: "userStatusDropped",
} satisfies Record<WorkContextResult["work"]["userStatus"], MessageKey>;

const sourceLabels = {
  linked: "sourceLinked", unlinked: "sourceUnlinked", ambiguous: "sourceAmbiguous",
} satisfies Record<WorkContextResult["source"]["state"], MessageKey>;

// Older Desktops only report chapter values. Order numeric chapters conservatively.
function legacyRelation(saved: ChapterValue | null | undefined, detected: PageContext["detectedChapter"]): Relation {
  if (!canUseDetectedChapter(detected)) return "unknown";
  const current = normalizeProgressChapter(saved);
  const page = normalizeProgressChapter(detected);
  if (current?.kind !== "numeric" || page?.kind !== "numeric") return "unknown";
  if (page.value === current.value) return "same";
  return page.value > current.value ? "ahead" : "behind";
}

function relationMessage(relation: Relation, saved: ChapterValue | null | undefined) {
  if (saved === null) return t("noProgress");
  switch (relation) {
    case "same": return t("upToDate");
    case "ahead": return t("progressAhead");
    case "behind": return t("previousChapterHint");
    case "series_page": return saved ? t("stoppedAtChapter", saved.value) : t("progressUnknown");
    case "unknown": return t("progressUnknown");
  }
}

export function getReadingModel(state: ReadyState, match: TrustedWorkMatch, detail?: WorkContextResult) {
  const { context, capabilities } = state;
  const saved = detail ? detail.work.progress : match.work.currentChapter;
  const detected = detail ? detail.page.detectedChapter : context.detectedChapter;
  const relation = detail ? detail.page.relation : legacyRelation(saved, context.detectedChapter);
  const sourceId = detail
    ? detail.source.state === "linked" ? detail.source.matchedSourceId : undefined
    : match.source?.id;
  const sourceName = detail
    ? detail.source.name ?? detail.source.domain
    : match.source?.name ?? match.source?.domain;
  const sourceStatus = detail ? t(sourceLabels[detail.source.state]) : match.source ? t("sourceRecognized") : t("sourceUnlinked");
  const addSource = (detail ? detail.source.state === "unlinked" : !match.source) && capabilities.includes("source.add");
  const target = detail?.continueTarget;
  const resume = target && detail.source.state !== "ambiguous" && target.url !== context.url &&
    target.url !== context.canonicalUrl ? target : undefined;

  const eligibleChapter = detail
    ? relation === "ahead" || saved === null
    : relation === "ahead" || (saved == null && normalizeProgressChapter(detected)?.kind === "numeric");
  let update: ProgressUpdateParams | undefined;
  if (eligibleChapter && detected && canUseDetectedChapter(detected) &&
      capabilities.includes("progress.update") && (!detail || sourceId)) {
    const { value, numericValue } = detected;
    update = { workId: match.work.id, pageUrl: context.url,
      chapter: { value, ...(numericValue === undefined ? {} : { numericValue }) },
      ...(sourceId ? { sourceId } : {}) };
  }

  let note: string | undefined;
  if (detail?.source.state === "unlinked") note = t("sourceUnlinkedDescription");
  else if (detail?.source.state === "ambiguous") note = t("sourceAmbiguousDescription");
  else if ((relation === "ahead" || (saved == null && detected)) && !update) note = t("progressCannotUpdate");

  return {
    title: detail?.work.title ?? match.work.title,
    status: detail && t(statusLabels[detail.work.userStatus]),
    sourceName: sourceName ?? context.siteName ?? context.domain ?? new URL(context.url).hostname,
    sourceStatus, saved, detected, relation, note, update, addSource, resume,
    summary: relationMessage(relation, saved),
    stoppedAt: detail && relation === "behind" && saved ? t("stoppedAtChapter", saved.value) : undefined,
    updateLabel: update && t(detail && saved === null ? "markChapter" : "updateProgress", update.chapter.value),
    savedLabel: t(detail ? "savedProgressLabel" : "progressCurrent"),
  };
}
export type ReadingModel = ReturnType<typeof getReadingModel>;
