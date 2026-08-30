# Auri Extension

Auri Extension é a extensão oficial do ecossistema Auri para Google Chrome e Microsoft Edge. Ela coleta, somente após uma ação explícita do usuário, o contexto mínimo da página atual e o apresenta ao Auri Desktop por uma abstração de transporte.

Esta é a versão **0.1.0**: uma base local-first, sem conta, servidor, cloud, analytics ou monitoramento permanente da navegação. O Native Messaging e o bridge com o Desktop ainda não fazem parte desta etapa.

## Estado atual

O popup analisa páginas HTTP/HTTPS sob demanda, identifica metadata útil de forma conservadora e permite simular o fluxo completo da futura integração. O Desktop permanece responsável pela Biblioteca, obras, Fontes, progresso, histórico e regras de negócio.

```text
Popup React
  ├─ activeTab + scripting (leitura sob demanda)
  ├─ extração e validação de PageContext
  └─ AuriTransport
       └─ MockAuriTransport (0.1.0)
          Futuro: NativeMessagingTransport → bridge → Auri Desktop
```

O service worker MV3 é mínimo e não mantém conexões, polling ou lógica de UI. Ele existe como ponto de entrada para a etapa futura do bridge.

## Stack

- TypeScript em modo strict;
- React;
- Vite;
- Vitest e Testing Library;
- Manifest V3;
- CSS próprio;
- `@auri/protocol` 0.1.0.

## Integração com `@auri/protocol`

O pacote é consumido exclusivamente pela API pública. `PageContext`, schemas, parâmetros/resultados de métodos, capabilities e `PROTOCOL_VERSION` são importados do pacote; nenhum contrato foi copiado para a extensão.

Durante o desenvolvimento local, a dependência usa:

```json
"@auri/protocol": "file:../Auri-Protocol"
```

Mantenha os repositórios irmãos com esta estrutura:

```text
ProjetosVsCode/
  ├─ Auri-Extension/
  └─ Auri-Protocol/
```

O pacote `Auri-Protocol` precisa ter seu `dist/` gerado. Se a estrutura local for diferente, ajuste apenas o caminho `file:` ou use um workspace npm que mantenha ambos os projetos irmãos. O pacote continua privado e não é publicado.

Na CI, os dois repositórios são baixados como irmãos. Se `Auri-Protocol` for privado e o token padrão não puder acessá-lo, configure o secret `AURI_PROTOCOL_TOKEN` com acesso somente de leitura.

## Extração de página

Ao abrir o popup, a extensão:

1. consulta somente a aba ativa;
2. recusa páginas que não sejam HTTP/HTTPS;
3. executa uma leitura curta do DOM com `chrome.scripting.executeScript`;
4. normaliza e valida o resultado com `pageContextSchema` do protocolo;
5. consulta o transporte abstrato.

Não há content script permanente. A leitura coleta URL, canonical HTTP/HTTPS quando presente, título (`og:title`, `<title>`, `h1`, hostname), nome do site (`og:site_name` ou hostname) e um possível capítulo.

A detecção de capítulo exige rótulos como `chapter`, `chap`, `ch`, `capítulo`, `capitulo` ou `cap`, com inteiros ou decimais. A prioridade é URL, título, metadata e heading. Números sem contexto — como ano, ID, comentário, temporada ou volume — não são interpretados como capítulo. Evidência de heading recebe confiança baixa e nunca habilita atualização rápida.

## Transporte e capabilities

`AuriTransport` expõe operações tipadas para:

- `system.hello`;
- `work.resolve`;
- `work.open`;
- `desktop.openAddWork`;
- `source.add`;
- `progress.update`.

O popup conhece apenas essa interface. A implementação atual, `MockAuriTransport`, responde de forma previsível; uma futura `NativeMessagingTransport` poderá substituí-la sem reescrever a UI.

As ações só aparecem quando a capability correspondente é negociada. A atualização de progresso também exige capítulo numérico com confiança suficiente e estritamente posterior ao progresso atual. Nunca há regressão ou atualização automática.

## Cenários de mock

Copie `.env.example` para `.env.local` e defina `VITE_AURI_MOCK_SCENARIO`:

- `disconnected` (padrão): Desktop indisponível;
- `matched`: obra e Fonte encontradas;
- `matched_no_source`: obra encontrada, Fonte nova;
- `not_found`: obra ausente da Biblioteca;
- `ambiguous`: mais de um candidato;
- `incompatible`: protocolo incompatível;
- `error`: falha recuperável;
- `missing_capability`: obra encontrada sem `progress.update`.

Não existe menu de desenvolvedor no build da extensão.

## Estados do popup

Estão implementados: análise, página não suportada, desconectado, obra encontrada, obra não encontrada, múltiplos matches, erro recuperável e protocolo incompatível. Também há representação de Fonte reconhecida, Fonte nova, capítulo detectado/ausente, progresso atual e feedback de ações simuladas.

O popup tem navegação nativa por teclado, foco visível, regiões com rótulos acessíveis, mensagens que não dependem apenas de cor e botões com estado disabled/loading.

## Permissões

O manifest solicita somente:

- `activeTab`: acesso temporário à aba após ação do usuário;
- `scripting`: leitura sob demanda do contexto da página;
- `storage`: reservado para preferências pequenas futuras; nenhum dado de página, obra ou progresso é persistido na 0.1.0.

Não há `<all_urls>`. `nativeMessaging` foi deliberadamente omitida até existir um bridge real.

## Privacidade

A extensão não coleta histórico, não observa abas em background, não executa análise permanente, não envia telemetry e não usa analytics. Nenhum contexto de página é persistido. A análise acontece apenas quando o usuário abre a extensão, e o Desktop continuará sendo a fonte de verdade.

## Desenvolvimento

Requisitos: Node.js 20+ e o repositório irmão `Auri-Protocol` com build disponível.

```bash
npm install
npm run dev
```

Validação:

```bash
npm test
npm run typecheck
npm run build
```

## Carregar a extensão unpacked

Primeiro execute `npm run build`. A pasta `dist/` conterá `manifest.json`, popup, assets e service worker.

Chrome:

1. abra `chrome://extensions`;
2. ative **Developer mode**;
3. escolha **Load unpacked**;
4. selecione `Auri-Extension/dist/`.

Edge:

1. abra `edge://extensions`;
2. ative **Developer mode**;
3. escolha **Load unpacked**;
4. selecione `Auri-Extension/dist/`.

## Ícones

O símbolo oficial foi integrado a partir de `Auri/build/auri-icon.png`. Os assets de 16, 32, 48 e 128 pixels em `public/icons/` são redimensionamentos determinísticos desse arquivo, sem redesenho, e estão configurados no manifest e no cabeçalho do popup.

## Limitações e roadmap imediato

Ainda não funcionam comunicação real, alteração da Biblioteca ou abertura real do Desktop. Também não há suporte a Firefox, adaptadores específicos por site, scraping, monitoramento, sync, cloud, context menu, atalhos ou publicação em loja.

Próxima sequência planejada:

1. Native Messaging;
2. bridge do Auri Desktop;
3. integração real usando `@auri/protocol`.
