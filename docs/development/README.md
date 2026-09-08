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

### Store PROD

```bash
npm run build
```

Esse comando gera `dist/` para publicação no Microsoft Edge Add-ons. O manifest não contém a chave da variante Embedded e o Native Host é `app.auri.native_host`.

### Embedded PROD

```bash
npm run build:embedded
```

Esse comando gera `artifacts/embedded/` para a instalação manual guiada no Chrome e Brave pelo Auri Desktop 1.12.0. A extensão usa o host de produção e possui identidade estável própria. Embedded é uma forma de distribuição PROD, não um ambiente DEV.

### Native Messaging DEV

```bash
npm run build:dev:native
```

Esse comando usa o mode `dev-native`, gera `artifacts/dev-native/` e configura `app.auri.native_host.dev`. O host DEV precisa ter sido instalado e registrado pelo fluxo de desenvolvimento do Auri Desktop. A extensão não possui menu interno de desenvolvimento.

## Carregar a extensão unpacked

Gere primeiro o build desejado e selecione a raiz correspondente:

- `artifacts/embedded/` para validar a distribuição PROD guiada no Chrome ou Brave;
- `artifacts/dev-native/` para E2E com o Native Host DEV;
- `dist/` somente quando for necessário conferir localmente o pacote Store.

### Chrome

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Escolha **Load unpacked**.
4. Selecione a pasta da variante que deseja validar.

### Edge

1. Abra `edge://extensions`.
2. Ative **Developer mode**.
3. Escolha **Load unpacked**.
4. Selecione a pasta da variante que deseja validar.

## Internacionalização

A versão 0.2.0 usa a API nativa [chrome.i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n), sem biblioteca de tradução. O navegador escolhe o idioma, com inglês como padrão e fallback (`default_locale: en`):

- English: [public/_locales/en/messages.json](../../public/_locales/en/messages.json);
- Português (Brasil): [public/_locales/pt_BR/messages.json](../../public/_locales/pt_BR/messages.json).

Para adicionar uma mensagem, crie a mesma chave nos dois arquivos e use `t("chave")` no popup. O helper em [src/i18n.ts](../../src/i18n.ts) apenas encaminha a chamada para `chrome.i18n.getMessage`; seus tipos vêm do catálogo inglês.

Frases com valores dinâmicos usam placeholders nomeados no JSON (por exemplo, `$CHAPTER$` com `content: "$1"`) e `t("updateProgress", chapter.value)`. Não traduza títulos, sites ou dados recebidos da página ou do Desktop. Mantenha as mesmas chaves, placeholders e posições nos dois idiomas; os testes focados em `tests/i18n/` verificam essa paridade.

Cada build copia os dois catálogos para seu próprio diretório de saída. Os catálogos não substituem os textos localizados configurados na loja.

## Validação

```bash
npm test
npm run typecheck
npm run build
npm run build:embedded
```

Use `npm run build:dev:native` adicionalmente quando a alteração envolver o fluxo Native Messaging DEV.

## Empacotamento e publicação

Os pacotes Store e Embedded, seus outputs e a metadata consumida pelo Desktop estão na [documentação de distribuição](../store/distribution.md). Os textos usados na loja estão em [store-listing.md](../store/store-listing.md).
