# Extração de página

A Auri Extension lê a página atual somente quando o popup é aberto ou utilizado. A leitura é feita sob demanda com `chrome.scripting.executeScript`; não existe content script permanente.

## Fluxo

1. A extensão consulta somente a aba ativa da janela atual.
2. Páginas que não usam HTTP ou HTTPS são recusadas.
3. Uma função autocontida coleta um snapshot curto do DOM.
4. Os valores são normalizados e validados pelos schemas públicos de `@auri/protocol`.
5. O contexto validado é enviado ao transporte selecionado.

## Contexto coletado

O snapshot pode conter:

- URL atual;
- URL canônica indicada por `link[rel~="canonical"]`;
- título do documento, `og:title` e primeiro `h1`;
- `og:site_name`;
- metadata de capítulo;
- `og:image` e `twitter:image`.

O título segue a prioridade `og:title`, `<title>`, `h1` e hostname. O nome do site usa `og:site_name` ou, na ausência dele, o hostname. URLs canônicas inválidas ou com protocolos diferentes de HTTP/HTTPS são descartadas.

## Detecção de capítulo

A detecção aceita inteiros e decimais associados a rótulos como `chapter`, `chap`, `ch`, `capítulo`, `capitulo` ou `cap`. A evidência é avaliada nesta ordem:

1. URL, com confiança alta;
2. título da página, com confiança média;
3. metadata dedicada, com confiança média;
4. heading, com confiança baixa.

Números sem contexto — como anos, IDs, comentários, temporadas ou volumes — não são interpretados como capítulo. Evidência de baixa confiança não habilita atualização rápida de progresso.

A atualização só é oferecida quando o capítulo detectado é numérico, tem confiança suficiente e é posterior ao progresso atual. Não existe regressão ou atualização automática.

## Capa

A extensão tenta primeiro `og:image` e depois `twitter:image`. URLs relativas são resolvidas contra a base do documento, e somente HTTP/HTTPS é aceito.

A capa permanece separada de `PageContext` e só é enviada em `desktop.openAddWork` quando o Desktop anuncia a capability `desktop.openAddWork.coverUrl`.
