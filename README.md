# Auri Extension

A **Auri Extension** conecta páginas de leitura no navegador à sua biblioteca local do **Auri Desktop**.

Ela permite reconhecer obras cadastradas, consultar seu progresso, abrir uma obra no Auri, adicionar novas obras ou fontes e atualizar capítulos diretamente pelo navegador.

> **Local-first:** a comunicação acontece diretamente entre a extensão e o Auri Desktop instalado no computador, sem conta ou serviço em nuvem.

[Auri Desktop](https://github.com/Fish7w7/Auri) · [Código da extensão](https://github.com/Fish7w7/Auri-Extension)

## O que você pode fazer

- reconhecer uma obra da sua biblioteca na página atual;
- consultar o progresso salvo e o capítulo identificado na página;
- abrir a obra no Auri Desktop;
- adicionar uma obra que ainda não está na biblioteca;
- adicionar a página como uma nova fonte;
- atualizar o progresso quando um capítulo posterior for detectado;
- aproveitar a capa informada pela página quando a versão do Desktop oferecer suporte.

A extração é conservadora: uma ação só é oferecida quando há contexto suficiente e sempre depende da sua interação.

## Requisitos

- **Auri Desktop 1.10.0 ou versão posterior compatível**, obrigatório para as funções reais da extensão;
- Windows, pois a integração atual depende do Auri Desktop e do Native Host instalado por ele;
- Microsoft Edge, Google Chrome, Brave ou outro navegador Chromium compatível.

A extensão é opcional: o Auri Desktop continua funcionando normalmente sem ela.

## Como funciona

A extensão analisa somente a aba ativa quando você abre ou utiliza o popup. Ela extrai de forma conservadora informações como título, fonte, capítulo e capa, quando disponíveis, e envia o contexto localmente ao Native Host instalado pelo Auri Desktop.

```text
Página atual
    ↓
Auri Extension
    ↓ Native Messaging
Auri Native Host
    ↓
Auri Desktop
```

O Auri Desktop continua responsável pela biblioteca, obras, fontes, progresso, histórico e regras de negócio. Não existe content script permanente, monitoramento de abas ou servidor Auri intermediário.

Os detalhes estão na [documentação de arquitetura](docs/README.md#arquitetura).

## Privacidade

A extensão só analisa a aba atual quando é utilizada. Ela não monitora sua navegação permanentemente, não possui analytics ou telemetry, não requer conta e não envia sua biblioteca para a nuvem. A comunicação com o Auri Desktop acontece localmente.

O Manifest V3 solicita apenas:

- `activeTab`: acesso temporário à aba atual após sua interação;
- `scripting`: leitura sob demanda das informações da página;
- `nativeMessaging`: comunicação local com o Auri Desktop.

A extensão não solicita `storage` nem `<all_urls>` e não utiliza service worker nesta versão. Consulte a [Política de Privacidade](PRIVACY.md).

## Instalação

A extensão continua distribuída oficialmente pelo **Microsoft Edge Add-ons** para o Edge.

Para Chrome e Brave, a versão 0.2.0 prepara uma variante oficial Embedded com ID estável, destinada à instalação manual guiada pelo Auri Desktop 1.12.0. Essa variante não altera a identidade da extensão publicada no Edge.

## Desenvolvimento

Requisito: Node.js 20 ou posterior. A comunicação usa o pacote compartilhado `@auri/protocol`.

```bash
npm install
npm run dev
```

O ambiente de desenvolvimento utiliza transporte mock por padrão. Para validar o projeto:

```bash
npm test
npm run typecheck
npm run build
```

`npm run build` sempre gera a extensão Store de produção. Para a variante Embedded, Native Messaging DEV, cenários de mock e carregamento unpacked, consulte o [guia de desenvolvimento](docs/development/README.md).

## Documentação

A [Documentação da Auri Extension](docs/README.md) reúne:

- arquitetura, extração de página, Native Messaging e Protocol;
- desenvolvimento, mocks e instalação unpacked;
- empacotamento e distribuição em lojas.

Consulte também a [Política de Privacidade](PRIVACY.md) e a [documentação de distribuição](docs/store/distribution.md).
