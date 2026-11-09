# Auri Protocol

A Auri Extension usa `@auri/protocol` como contrato compartilhado com o Auri Desktop. A versão atual da dependência é **0.2.1**, com `protocolVersion` **1**.

## Dependência

O npm instala a mesma distribuição do Protocol usada no Desktop:

```json
"@auri/protocol": "file:vendor/auri-protocol-0.2.1.tgz"
```

O tarball inclui o código-fonte e os módulos compilados. O lockfile fixa a integridade do arquivo e a versão 4.6.6 do Zod. O pacote deriva de [Auri-Protocol v0.2.0](https://github.com/Fish7w7/Auri-Protocol/tree/v0.2.0), com a migração de validação compatível com wire v1.

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

Quando `work.context` está disponível, o fluxo é `system.hello → leitura da aba → work.resolve → work.context`. A extensão envia `WorkContextParams` e interpreta `WorkContextResult` diretamente do pacote. Relação entre capítulos, identidade da fonte e `continueTarget` são decisões do Desktop, não são reconstruídas no popup.

O Auri Desktop 1.13 não anuncia `work.context`. Nesse caso a extensão não chama o método e mantém o fluxo legado baseado nos métodos já existentes, sem tratar a ausência da capability como incompatibilidade de protocolo.
