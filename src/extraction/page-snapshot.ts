export interface PageSnapshot {
  currentUrl: string;
  documentBaseUri?: string;
  canonicalHref?: string;
  documentTitle?: string;
  heading?: string;
  metadataChapter?: string;
  ogSiteName?: string;
  ogTitle?: string;
  ogImage?: string;
  twitterImage?: string;
}

/**
 * Executada no contexto isolado da aba por chrome.scripting.executeScript.
 * Deve permanecer autocontida: funções injetadas não preservam closures.
 */
export function collectPageSnapshot(): PageSnapshot {
  const content = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;

  return {
    currentUrl: window.location.href,
    documentBaseUri: document.baseURI,
    canonicalHref:
      document.querySelector<HTMLLinkElement>('link[rel~="canonical" i]')?.href || undefined,
    documentTitle: document.title.trim() || undefined,
    heading: document.querySelector<HTMLHeadingElement>("h1")?.textContent?.trim() || undefined,
    metadataChapter:
      content('meta[name="chapter"]') ||
      content('meta[name="chapter_number"]') ||
      content('meta[property="article:chapter"]'),
    ogSiteName: content('meta[property="og:site_name"]'),
    ogTitle: content('meta[property="og:title"]'),
    ogImage: content('meta[property="og:image"]'),
    twitterImage: content('meta[name="twitter:image"]'),
  };
}
