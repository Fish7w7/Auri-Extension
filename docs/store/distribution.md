# Distribuição da Auri Extension 0.2.0

A versão 0.2.0 possui duas variantes de produção separadas. Ambas usam `app.auri.native_host`, Manifest V3, as locales `en` e `pt_BR` e as mesmas permissões.

## Store

```bash
npm run build
npm run package:store
```

- Build: `dist/`.
- Pacote: `release/auri-extension-0.2.0-chromium.zip`.
- Destino: atualização da extensão existente no Microsoft Edge Add-ons.
- ID oficial do Edge: `alnngjgmhiebpnjefjmhbhmhfpgoibnh`.
- O manifest não contém `key`; a identidade continua sendo administrada pela loja.

## Embedded

```bash
npm run build:embedded
npm run package:embedded
```

- Build: `artifacts/embedded/`.
- Pacote: `release/auri-extension-0.2.0-embedded.zip`.
- Metadata: `release/auri-extension-0.2.0-embedded.json`.
- Destino: instalação manual guiada no Chrome e Brave pelo Auri Desktop 1.12.0.
- ID fixo: `agefiaohfielfgadiagemnflekbboblp`.

O arquivo [config/embedded-extension.json](../../config/embedded-extension.json) contém somente a chave pública DER codificada em Base64 usada no campo [`key` do manifest](https://developer.chrome.com/docs/extensions/reference/manifest/key). Essa chave pública não é um secret e existe apenas para tornar o ID da extensão unpacked determinístico. Nenhuma chave privada é necessária, armazenada ou distribuída.

O ID é calculado conforme a [implementação do Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/id_util.cc): os primeiros 16 bytes do SHA-256 da chave pública são codificados com o alfabeto `a`–`p`. Ele pertence exclusivamente à variante Embedded e não imita o ID do Edge.

A metadata informa versão, ID, SHA-256 do ZIP, Manifest Version, locale padrão, protocolVersion e Native Host. O Desktop deve validar o hash antes de usar o pacote.

## DEV

```bash
npm run build:dev:native
```

O build DEV fica em `artifacts/dev-native/` e usa `app.auri.native_host.dev`. Ele não deve ser distribuído nem confundido com a variante Embedded.
