# Desenvolvimento

## Primeiros passos

Requisitos:

- Node.js 20 ou posterior;
- npm 10, conforme a configuração do projeto.

```bash
npm install
npm run dev
```

O servidor de desenvolvimento usa o transporte mock por padrão. Copie `.env.example` para `.env.local` quando quiser selecionar explicitamente um cenário.

## Cenários de mock

Use `VITE_AURI_TRANSPORT=mock` e defina `VITE_AURI_MOCK_SCENARIO` como um dos valores abaixo:

- `disconnected` — Desktop indisponível; é o padrão;
- `matched` — obra e fonte encontradas;
- `matched_no_source` — obra encontrada, mas a página representa uma fonte nova;
- `not_found` — obra ausente da biblioteca;
- `ambiguous` — mais de um candidato;
- `incompatible` — protocolo incompatível;
- `error` — falha recuperável;
- `missing_capability` — obra encontrada sem `progress.update`.

## Builds

### Produção

```bash
npm run build
```

Esse comando sempre gera uma extensão de produção com o Native Host `app.auri.native_host`. Uma variável `VITE_AURI_TRANSPORT` no ambiente não pode selecionar mock ou host DEV nesse build.

### Native Messaging DEV

```bash
npm run build:dev:native
```

Esse comando usa o mode `dev-native` e gera uma extensão unpacked configurada para `app.auri.native_host.dev`. O host DEV precisa ter sido instalado e registrado pelo fluxo do Auri Desktop. A extensão não possui menu interno de desenvolvimento.

## Carregar a extensão unpacked

Gere primeiro o build desejado. A pasta `dist/` conterá o Manifest V3, o popup e os assets.

### Chrome

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Escolha **Load unpacked**.
4. Selecione a pasta `Auri-Extension/dist/`.

### Edge

1. Abra `edge://extensions`.
2. Ative **Developer mode**.
3. Escolha **Load unpacked**.
4. Selecione a pasta `Auri-Extension/dist/`.

## Internacionalização

A versão 0.1.1 usa a API nativa [chrome.i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n), sem biblioteca de tradução. O navegador escolhe o idioma, com inglês como padrão e fallback (`default_locale: en`):

- English: [public/_locales/en/messages.json](../../public/_locales/en/messages.json);
- Português (Brasil): [public/_locales/pt_BR/messages.json](../../public/_locales/pt_BR/messages.json).

Para adicionar uma mensagem, crie a mesma chave nos dois arquivos e use `t("chave")` no popup. O helper em [src/i18n.ts](../../src/i18n.ts) apenas encaminha a chamada para `chrome.i18n.getMessage`; seus tipos vêm do catálogo inglês.

Frases com valores dinâmicos usam placeholders nomeados no JSON (por exemplo, `$CHAPTER$` com `content: "$1"`) e `t("updateProgress", chapter.value)`. Não traduza títulos, sites ou dados recebidos da página ou do Desktop. Mantenha as mesmas chaves, placeholders e posições nos dois idiomas; os testes focados em `tests/i18n/` verificam essa paridade.

O build copia os dois catálogos para `dist/_locales/`. A listagem PT-BR no Partner Center será preenchida manualmente após o envio do novo pacote; os catálogos não substituem os textos da loja.

## Validação

```bash
npm test
npm run typecheck
npm run build
```

Use `npm run build:dev:native` adicionalmente quando a alteração envolver o fluxo Native Messaging DEV.

## Empacotamento e publicação

O empacotamento para lojas, o conteúdo do ZIP e o estado de distribuição ficam no [checklist de publicação](../store/release-checklist.md). Os textos usados nas lojas estão em [store-listing.md](../store/store-listing.md).
