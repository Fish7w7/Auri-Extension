# Metadata para as lojas — Auri 0.2.0

## Nome

Auri

## Descrição curta

Conecte suas leituras no navegador à sua biblioteca local do Auri Desktop.

## Descrição completa

Auri conecta a página de leitura que você está visualizando à sua biblioteca local do Auri Desktop.

Ao abrir a extensão, ela identifica de forma conservadora o contexto da página ativa, como URL, título, site, capítulo e capa disponível. Com sua confirmação, é possível localizar a obra na Biblioteca, abrir o Auri, sugerir uma nova obra ou fonte e atualizar o progresso.

A extensão requer o Auri Desktop instalado no mesmo computador. A comunicação acontece localmente por Native Messaging, sem servidor Auri, conta, cloud, analytics ou monitoramento permanente da navegação.

O Microsoft Edge recebe a extensão pelo Edge Add-ons. Chrome e Brave usam a variante Embedded instalada manualmente pelo fluxo guiado do Auri Desktop 1.12.0.

## Finalidade principal

Conectar, sob ação explícita do usuário, o contexto da página de leitura ativa à biblioteca local mantida pelo Auri Desktop.

## Justificativa das permissões

### `activeTab`

Permite analisar somente a página que o usuário está visualizando quando abre ou aciona a extensão.

### `scripting`

Permite executar, sob demanda, a extração de metadata da página ativa. Não existe content script permanente.

### `nativeMessaging`

Permite conectar a extensão localmente ao aplicativo Auri Desktop instalado no computador. Nenhum servidor remoto é utilizado nessa comunicação.

## Resumo de privacidade

A extensão lê apenas o contexto necessário da aba ativa quando é acionada. Não monitora histórico ou abas em background, não possui telemetry ou analytics e não envia dados a servidores Auri. A biblioteca permanece local no Auri Desktop. Consulte `PRIVACY.md` para a política completa.

## Dependência

Requer Auri Desktop compatível instalado e com o Native Host oficial configurado.

## Navegadores

- Microsoft Edge, pelo Edge Add-ons;
- Google Chrome, pela variante Embedded;
- Brave, pela variante Embedded e compatibilidade Chromium.

O pacote Store não contém a chave usada para estabilizar a identidade da variante Embedded.
