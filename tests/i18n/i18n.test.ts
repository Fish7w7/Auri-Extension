import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import en from "../../public/_locales/en/messages.json";
import ptBR from "../../public/_locales/pt_BR/messages.json";
import manifest from "../../public/manifest.json";
import packageMetadata from "../../package.json";
import { localizeDocument, t } from "../../src/i18n";
import { installChromeI18nMock } from "../helpers/chrome-i18n";

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogs: Record<string, Record<string, Message>> = { en, pt_BR: ptBR };
const manifestMessages = [manifest.name, manifest.description, manifest.action.default_title];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe("catálogos i18n e manifest", () => {
  it("declara somente en e pt_BR, com inglês como padrão", () => {
    expect(readdirSync(resolve(projectRoot, "public/_locales")).sort()).toEqual(["en", "pt_BR"]);
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extensionName__");
    expect(manifest.description).toBe("__MSG_extensionDescription__");
    expect(manifest.action.default_title).toBe("__MSG_actionTitle__");
  });

  it("mantém versão 0.2.0 consistente sem alterar Protocol nem permissões", () => {
    const lock = JSON.parse(readFileSync(resolve(projectRoot, "package-lock.json"), "utf8"));
    expect(packageMetadata.version).toBe("0.2.0");
    expect(manifest.version).toBe(packageMetadata.version);
    expect(lock.version).toBe(packageMetadata.version);
    expect(lock.packages[""].version).toBe(packageMetadata.version);
    expect(packageMetadata.dependencies["@auri/protocol"]).toBe("github:Fish7w7/Auri-Protocol#v0.1.3");
    expect(lock.packages["node_modules/@auri/protocol"].version).toBe("0.1.3");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "nativeMessaging"]);
    for (const key of ["background", "host_permissions", "optional_permissions", "content_scripts"]) {
      expect(manifest).not.toHaveProperty(key);
    }
  });

  it("mantém exatamente as mesmas chaves e placeholders em ambos os idiomas", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      const shape = (entry: Message) => Object.entries(entry.placeholders ?? {})
        .map(([name, value]) => [name.toLowerCase(), value.content]).sort();
      expect(shape(catalogs.pt_BR[key]), key).toEqual(shape(catalogs.en[key]));
    }
  });

  it.each(Object.entries(catalogs))("valida mensagens e referências a placeholders de %s", (_locale, catalog) => {
    for (const [key, entry] of Object.entries(catalog)) {
      expect(entry.message.trim(), key).not.toBe("");
      const referenced = [...new Set([...entry.message.matchAll(/\$([a-z_]+)\$/giu)]
        .map((match) => match[1].toLowerCase()))].sort();
      expect(referenced, key).toEqual(Object.keys(entry.placeholders ?? {}).sort());
      for (const placeholder of Object.values(entry.placeholders ?? {})) {
        expect(placeholder.content, key).toMatch(/^\$[1-9]$/u);
      }
    }
    for (const reference of manifestMessages) {
      const key = /^__MSG_(\w+)__$/u.exec(reference)?.[1];
      expect(key).toBeDefined();
      expect(catalog[key!]?.message).toBeTruthy();
    }
  });

  it("cobre todas as mensagens usadas em src e não deixa texto JSX de UI hardcoded", () => {
    const used = new Set(manifestMessages.map((reference) => reference.slice(6, -2)));
    const literals: string[] = [];
    for (const file of sourceFiles(resolve(projectRoot, "src"))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
          const key = node.arguments[0];
          if (key && ts.isStringLiteral(key)) used.add(key.text);
        }
        if (ts.isJsxText(node) && node.text.trim()) literals.push(node.text.trim());
        if (ts.isJsxAttribute(node) && ["aria-label", "title", "alt", "connection"].includes(node.name.getText(source))) {
          if (node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text) {
            literals.push(node.initializer.text);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(literals).toEqual([]);
    expect([...used].sort()).toEqual(Object.keys(en).sort());
    for (const catalog of Object.values(catalogs)) {
      for (const key of used) expect(catalog[key], key).toBeDefined();
    }
  });
});

describe("helper nativo e mock chrome.i18n", () => {
  it("encaminha chave e substituições sem traduzir ou alterar dados dinâmicos", () => {
    const getMessage = installChromeI18nMock("en");
    const title = "Minha obra $CHAPTER$ <volume 2>";
    expect(t("openWorkNamedSuccess", title)).toBe(`${title} opened in Auri.`);
    expect(getMessage).toHaveBeenLastCalledWith("openWorkNamedSuccess", title);
    expect(t("updateProgress", ["327.5"])).toBe("Update to 327.5");
    expect(getMessage).toHaveBeenLastCalledWith("updateProgress", ["327.5"]);
    expect(chrome.i18n.getMessage("unknown_message")).toBe("");
  });

  it.each([
    ["en", "en", "Try again"],
    ["pt-BR", "pt-BR", "Tentar novamente"],
    ["en-GB", "en", "Try again"],
    ["fr", "en", "Try again"],
  ])("simula a resolução do navegador em %s e ajusta o idioma semântico", (locale, language, retry) => {
    installChromeI18nMock(locale);
    localizeDocument();
    expect(t("retry")).toBe(retry);
    expect(document.documentElement.lang).toBe(language);
    expect(document.title).toBe("Auri");
  });
});
