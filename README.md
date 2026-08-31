# Auri

Auri é a extensão oficial que conecta suas leituras no navegador à biblioteca local do Auri Desktop.

## Para usuários

A extensão analisa a aba ativa somente quando você abre o popup. Ela permite localizar a obra na sua Biblioteca, abrir o Auri, sugerir uma nova obra ou Fonte e atualizar o progresso. O **Auri Desktop é obrigatório** e continua responsável pela Biblioteca e pelos dados locais.

A versão **0.1.0** é destinada a Google Chrome, Microsoft Edge e navegadores Chromium compatíveis, incluindo Brave. Não há conta, servidor Auri, cloud, analytics ou monitoramento permanente da navegação. Consulte a [política de privacidade](PRIVACY.md).

## Arquitetura

O popup analisa páginas HTTP/HTTPS sob demanda e identifica metadata útil de forma conservadora. O Desktop permanece responsável pela Biblioteca, obras, Fontes, progresso, histórico e regras de negócio.

```text
Popup React
  ├─ activeTab + scripting (leitura sob demanda)
  ├─ extração e validação de PageContext
  └─ AuriTransport
       ├─ NativeMessagingTransport → host nativo → Auri Desktop
       └─ MockAuriTransport (desenvolvimento)
```

Não há service worker nesta versão. O popup abre diretamente um Port Native Messaging e o encerra quando é fechado.

## Stack

- TypeScript em modo strict;
- React;
- Vite;
- Vitest e Testing Library;
- Manifest V3;
- CSS próprio;
- `@auri/protocol` 0.1.3 (protocolVersion 1).

## Integração com `@auri/protocol`

O pacote é consumido exclusivamente pela API pública. `PageContext`, schemas, parâmetros/resultados de métodos, capabilities e `PROTOCOL_VERSION` são importados do pacote; nenhum contrato foi copiado para a extensão.

O Protocol é instalado diretamente da tag GitHub correspondente à versão 0.1.3:

```json
"@auri/protocol": "github:Fish7w7/Auri-Protocol#v0.1.3"
```

A dependência é pinada e não exige um repositório irmão. O lifecycle `prepare` do Protocol gera `dist/` durante a instalação Git, mantendo os artefatos compilados fora do controle de versão. Para trabalhar simultaneamente nos dois repositórios, `npm link` pode ser usado apenas como conveniência local, sem alterar a dependência oficial.

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

O popup conhece apenas essa interface. O mode `production`, usado por `npm run build`, força `NativeMessagingTransport` com `app.auri.native_host` e ignora qualquer seleção mock. O mode `dev-native`, usado por `npm run build:dev:native`, força `app.auri.native_host.dev`. No servidor de desenvolvimento, `VITE_AURI_TRANSPORT=mock` usa respostas previsíveis, `native` usa o host DEV e o fallback sem variável é mock.

O transporte mantém um Port por popup, cria envelopes e valida respostas pela API pública do Protocol, correlaciona respostas por ID mesmo fora de ordem, limita mensagens pelo tamanho UTF-8 do contrato e aplica timeout de 20 segundos. O primeiro pedido é sempre `system.hello`, e somente as capabilities retornadas por ele habilitam ações.

As ações só aparecem quando a capability correspondente é negociada. Capabilities futuras desconhecidas são aceitas no wire e ignoradas com o narrowing público do Protocol. A atualização de progresso também exige capítulo numérico com confiança suficiente e estritamente posterior ao progresso atual. Nunca há regressão ou atualização automática.

A extração também lê, de forma conservadora, `og:image` e o fallback `twitter:image`. URLs relativas são resolvidas contra a base do documento e somente HTTP/HTTPS é aceito. A capa permanece fora de `PageContext` e só segue em `desktop.openAddWork` quando o Desktop anuncia `desktop.openAddWork.coverUrl`.

## Cenários de mock

Copie `.env.example` para `.env.local`, mantenha `VITE_AURI_TRANSPORT=mock` e defina `VITE_AURI_MOCK_SCENARIO`:

- `disconnected` (padrão): Desktop indisponível;
- `matched`: obra e Fonte encontradas;
- `matched_no_source`: obra encontrada, Fonte nova;
- `not_found`: obra ausente da Biblioteca;
- `ambiguous`: mais de um candidato;
- `incompatible`: protocolo incompatível;
- `error`: falha recuperável;
- `missing_capability`: obra encontrada sem `progress.update`.

Para gerar a extensão unpacked destinada ao E2E com o host DEV, execute:

```bash
npm run build:dev:native
```

Esse comando usa o mode `dev-native` e seleciona deterministicamente `app.auri.native_host.dev`. Ele pressupõe que o host `.dev` já esteja instalado e registrado pelo fluxo do Desktop. Não existe menu de desenvolvedor no build da extensão.

## Estados do popup

Estão implementados: análise, página não suportada, desconectado, obra encontrada, obra não encontrada, múltiplos matches, erro recuperável e protocolo incompatível. Também há representação de Fonte reconhecida, Fonte nova, capítulo detectado/ausente, progresso atual e feedback de ações simuladas.

O popup tem navegação nativa por teclado, foco visível, regiões com rótulos acessíveis, mensagens que não dependem apenas de cor e botões com estado disabled/loading.

## Permissões

O manifest solicita somente:

- `activeTab`: acesso temporário à aba após ação do usuário;
- `scripting`: leitura sob demanda do contexto da página;
- `nativeMessaging`: comunicação local com o host instalado pelo Auri Desktop.

Não há `storage`, `tabs` nem `<all_urls>`.

## Privacidade

A extensão não coleta histórico, não observa abas em background, não executa análise permanente, não envia telemetry e não usa analytics. Nenhum contexto de página é persistido. A análise e a conexão local acontecem apenas quando o usuário abre a extensão, e o Desktop continua sendo a fonte de verdade.

## Desenvolvimento

Requisito: Node.js 20+. O `@auri/protocol` é obtido automaticamente da tag GitHub pinada.

```bash
npm install
npm run dev
```

O servidor de desenvolvimento usa mock por padrão. `npm run build` é sempre a build oficial de produção e seleciona obrigatoriamente `app.auri.native_host`, mesmo que exista uma variável `VITE_AURI_TRANSPORT` no ambiente.

Validação:

```bash
npm test
npm run typecheck
npm run build
```

## Distribuição

O pacote de loja é gerado somente depois do build oficial de produção:

```bash
npm run build
npm run package:store
```

O resultado é `release/auri-extension-0.1.0-chromium.zip`, compartilhado por Chrome e Edge e compatível com Brave. O ZIP contém apenas `dist/`, sem source, testes, configurações DEV, `node_modules` ou sourcemaps.

Textos para as lojas estão em [docs/store-listing.md](docs/store-listing.md) e os passos de publicação em [docs/release-checklist.md](docs/release-checklist.md). Nenhum ID oficial é presumido: os IDs de Chrome, Edge e Brave serão obtidos ou confirmados após a distribuição e então configurados no release do Auri Desktop.

## Carregar a extensão unpacked

Primeiro execute `npm run build`. A pasta `dist/` conterá `manifest.json`, popup e assets, sem service worker.

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

O transporte foi validado em E2E DEV no Brave com o Auri Desktop 1.10.0. A validação de produção ainda depende dos IDs oficiais atribuídos pelas lojas. Não há suporte a Firefox, adaptadores específicos por site, scraping, monitoramento, sync, cloud, context menu, atalhos ou publicação em loja nesta etapa.

Próxima sequência planejada:

1. publicar nas lojas sem automatizar o upload;
2. registrar os IDs oficiais no release do Desktop;
3. executar o E2E de produção e publicar o Setup definitivo.
