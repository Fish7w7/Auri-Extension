# Native Messaging

A extensão se comunica localmente com o Auri Desktop por meio de um Native Host. O Desktop continua sendo a fonte de verdade para biblioteca, obras, fontes, progresso, histórico e regras de negócio.

## Transportes

O popup depende da interface `AuriTransport`, que oferece operações tipadas para:

- `system.hello`;
- `work.resolve`;
- `work.open`;
- `desktop.openAddWork`;
- `source.add`;
- `progress.update`.

Existem duas implementações:

- `NativeMessagingTransport`, usado na integração real com o Desktop;
- `MockAuriTransport`, usado no desenvolvimento isolado.

## Seleção por modo de build

| Fluxo | Transporte | Native Host |
| --- | --- | --- |
| `npm run build` | Native Messaging | `app.auri.native_host` |
| `npm run build:dev:native` | Native Messaging | `app.auri.native_host.dev` |
| `npm run dev` sem seleção nativa | Mock | não se aplica |

O mode `production` sempre força o host oficial e ignora uma configuração mock do ambiente. O mode `dev-native` seleciona deterministicamente o host DEV. A seleção não depende de Registry, executáveis ou repositórios locais.

## Conexão e mensagens

Cada popup mantém um Port Native Messaging enquanto está aberto e o encerra no fechamento. O transporte:

- cria envelopes pela API pública do Protocol;
- atribui um ID único a cada solicitação;
- correlaciona respostas por ID, mesmo quando chegam fora de ordem;
- valida método e conteúdo das respostas;
- aplica o limite de mensagem pelo tamanho UTF-8 definido no Protocol;
- encerra solicitações após 20 segundos sem resposta;
- classifica ausência do host, falha de inicialização, desconexão, incompatibilidade e erros do Protocol.

O primeiro pedido é `system.hello`. O popup verifica a versão negociada e só oferece ações para as capabilities reconhecidas que o Desktop anunciou. Capabilities futuras desconhecidas são aceitas no wire e ignoradas pela extensão atual.

## Comportamento do popup

A interface representa análise, página não suportada, Desktop desconectado, protocolo incompatível, falha recuperável, obra encontrada, obra ausente e múltiplos candidatos. Ações em andamento ficam desabilitadas e retornam feedback explícito; conflitos que exigem confirmação são encaminhados ao usuário no Desktop.
