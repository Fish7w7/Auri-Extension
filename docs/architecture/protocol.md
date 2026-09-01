# Auri Protocol

A Auri Extension usa `@auri/protocol` como contrato compartilhado com o Auri Desktop. A versão atual da dependência é **0.1.3**, com `protocolVersion` **1**.

## Dependência

O pacote é instalado diretamente da tag GitHub correspondente:

```json
"@auri/protocol": "github:Fish7w7/Auri-Protocol#v0.1.3"
```

A referência é pinada e não depende da presença física de um repositório irmão. A tag declara o lifecycle `prepare`, responsável por gerar `dist/` durante a instalação a partir do Git.

Para desenvolvimento simultâneo dos dois repositórios, `npm link` pode ser usado como conveniência local, sem modificar a dependência oficial.

## Uso da API pública

A extensão importa do pacote:

- `PageContext` e schemas de validação;
- parâmetros e resultados dos métodos;
- envelopes de requisição e resposta;
- `PROTOCOL_VERSION`;
- capabilities conhecidas;
- limite máximo das mensagens.

Nenhum contrato do Protocol é copiado para o repositório da extensão.

## Negociação de capabilities

A conexão começa com `system.hello`. A resposta informa a versão do protocolo e as capabilities disponíveis. A extensão exige compatibilidade com `protocolVersion` 1 e somente habilita cada ação quando a capability correspondente foi anunciada.

Capabilities desconhecidas podem atravessar o wire para permitir evolução compatível, mas são ignoradas pela versão atual por meio do narrowing público fornecido pelo pacote.
