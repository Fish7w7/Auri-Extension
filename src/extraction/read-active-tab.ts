import type { PageContext } from "@auri/protocol";

import { extractPageContext } from "./extract-page-context";
import { collectPageSnapshot } from "./page-snapshot";

export type ActivePageResult =
  | { status: "ready"; context: PageContext }
  | { status: "unsupported" };

export async function readActivePage(): Promise<ActivePageResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return { status: "unsupported" };

  try {
    const parsed = new URL(tab.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "unsupported" };
    }
  } catch {
    return { status: "unsupported" };
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageSnapshot,
    });
    if (!injection?.result) return { status: "unsupported" };

    const extraction = extractPageContext(injection.result);
    return extraction.ok
      ? { status: "ready", context: extraction.context }
      : { status: "unsupported" };
  } catch (error) {
    if (import.meta.env.DEV) console.error("Falha ao analisar a página ativa", error);
    return { status: "unsupported" };
  }
}
