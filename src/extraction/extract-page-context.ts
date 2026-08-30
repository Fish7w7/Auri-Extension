import {
  pageContextSchema,
  type DetectedChapter,
  type PageContext,
} from "@auri/protocol";

import type { PageSnapshot } from "./page-snapshot";

const CHAPTER_LABEL = String.raw`(?:chapter|chap|ch|cap[ií]tulo|cap)`;
const CHAPTER_VALUE = String.raw`(\d+(?:\.\d+)?)`;
const LABELED_CHAPTER = new RegExp(
  String.raw`(?:^|[\s/_?&=#.\-])${CHAPTER_LABEL}[\s_:\-=/]*${CHAPTER_VALUE}(?=$|[^\d])`,
  "iu",
);
const METADATA_NUMBER = new RegExp(String.raw`^\s*${CHAPTER_VALUE}\s*$`, "u");

export type ExtractionResult =
  | { ok: true; context: PageContext }
  | { ok: false; reason: "unsupported" };

function cleanText(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function parseHttpUrl(value: string | undefined, base?: string): URL | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function chapterFrom(
  value: string | undefined,
  source: DetectedChapter["source"],
  confidence: DetectedChapter["confidence"],
  allowBareNumber = false,
): DetectedChapter | undefined {
  if (!value) return undefined;
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();
  const match = LABELED_CHAPTER.exec(decoded) ?? (allowBareNumber ? METADATA_NUMBER.exec(decoded) : null);
  if (!match?.[1]) return undefined;

  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue)) return undefined;

  return {
    value: match[1],
    numericValue,
    confidence,
    source,
  };
}

export function detectChapter(snapshot: PageSnapshot): DetectedChapter | undefined {
  const urlEvidence = chapterFrom(snapshot.currentUrl, "url", "high");
  if (urlEvidence) return urlEvidence;

  const titleEvidence = chapterFrom(
    snapshot.ogTitle ?? snapshot.documentTitle,
    "page-title",
    "medium",
  );
  if (titleEvidence) return titleEvidence;

  const metadataEvidence = chapterFrom(snapshot.metadataChapter, "metadata", "medium", true);
  if (metadataEvidence) return metadataEvidence;

  return chapterFrom(snapshot.heading, "metadata", "low");
}

export function extractPageContext(snapshot: PageSnapshot): ExtractionResult {
  const currentUrl = parseHttpUrl(snapshot.currentUrl);
  if (!currentUrl) return { ok: false, reason: "unsupported" };

  const canonicalUrl = parseHttpUrl(snapshot.canonicalHref, currentUrl.href);
  const title = cleanText(
    snapshot.ogTitle ?? snapshot.documentTitle ?? snapshot.heading ?? currentUrl.hostname,
    512,
  );
  const siteName = cleanText(snapshot.ogSiteName ?? currentUrl.hostname, 160);
  const detectedChapter = detectChapter(snapshot);
  const candidate: PageContext = {
    url: currentUrl.href,
    ...(canonicalUrl ? { canonicalUrl: canonicalUrl.href } : {}),
    ...(title ? { title } : {}),
    ...(siteName ? { siteName } : {}),
    domain: currentUrl.hostname,
    ...(detectedChapter ? { detectedChapter } : {}),
  };

  const parsed = pageContextSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, context: parsed.data }
    : { ok: false, reason: "unsupported" };
}
