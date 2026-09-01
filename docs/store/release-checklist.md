# Empacotamento e publicação — Auri Extension 0.1.0

## Estado atual

A versão 0.1.0 foi enviada ao Microsoft Edge Add-ons e está em revisão. Ainda não existe URL pública confirmada para incluir na documentação.

Não há publicação oficial anunciada para a Chrome Web Store ou específica para o Brave. O Brave pode executar extensões Chromium compatíveis, mas sua origem e seu ID precisam ser validados no canal efetivamente utilizado.

## Gerar o pacote

O pacote de loja deve ser criado somente depois do build oficial de produção:

```bash
npm run build
npm run package:store
```

O resultado é `release/auri-extension-0.1.0-chromium.zip`. O ZIP contém apenas o conteúdo de `dist/`, sem código-fonte, testes, configurações DEV, `node_modules` ou sourcemaps.

## Checklist

- [ ] Executar testes relevantes, typecheck e build de produção.
- [ ] Executar `npm run package:store`.
- [ ] Validar o conteúdo e o tamanho de `release/auri-extension-0.1.0-chromium.zip`.
- [x] Enviar a versão 0.1.0 ao Microsoft Edge Add-ons.
- [ ] Aguardar a conclusão da revisão da Microsoft.
- [ ] Depois da publicação, registrar a URL pública e o ID oficial atribuídos pelo Edge.
- [ ] Validar a instalação pelo canal oficial do Edge.
- [ ] Tratar uma eventual publicação na Chrome Web Store como processo separado.
- [ ] Validar a instalação e a origem efetivamente usadas pelo Brave, sem presumir o mesmo ID do Chrome ou do Edge.
- [ ] Executar o E2E de produção somente com IDs oficiais confirmados.

IDs unpacked, DEV ou de teste não devem ser documentados ou reutilizados como IDs oficiais.
