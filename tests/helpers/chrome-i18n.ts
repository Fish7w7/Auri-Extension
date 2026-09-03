import { vi } from "vitest";

import en from "../../public/_locales/en/messages.json";
import ptBR from "../../public/_locales/pt_BR/messages.json";

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const catalogs: Record<string, Record<string, Message>> = { en, pt_BR: ptBR };

// Only the test environment resolves catalogs; production delegates to the browser.
export function installChromeI18nMock(locale = "en") {
  const normalizedLocale = locale.replaceAll("-", "_");
  const catalog = catalogs[normalizedLocale] ?? catalogs[normalizedLocale.split("_")[0]] ?? catalogs.en;
  const getMessage = vi.fn((key: string, substitutions?: string | string[]) => {
    const entry = catalog[key] ?? catalogs.en[key];
    if (!entry) return "";
    const values = typeof substitutions === "string" ? [substitutions] : substitutions ?? [];
    return entry.message.replace(/\$([a-z_]+)\$/giu, (_token, name: string) => {
      const placeholder = entry.placeholders?.[name.toLowerCase()];
      return placeholder?.content.replace(/\$(\d)/gu, (_position, index: string) =>
        values[Number(index) - 1] ?? ""
      ) ?? "";
    });
  });
  vi.stubGlobal("chrome", {
    ...globalThis.chrome,
    i18n: { ...globalThis.chrome?.i18n, getMessage },
  });
  return getMessage;
}
