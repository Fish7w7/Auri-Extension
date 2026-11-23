import type { PageContext, WorkContextParams } from "@auri/protocol";

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
