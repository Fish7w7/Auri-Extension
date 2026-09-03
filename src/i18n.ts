import type messages from "../public/_locales/en/messages.json";

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions);
}

export function localizeDocument(): void {
  document.documentElement.lang = t("documentLanguage");
  document.title = t("extensionName");
}
