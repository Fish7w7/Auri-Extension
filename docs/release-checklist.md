# Checklist de publicação — Auri Extension 0.1.0

- [ ] Executar testes focados, typecheck e build production.
- [ ] Executar `npm run package:store`.
- [ ] Validar o conteúdo e o tamanho de `release/auri-extension-0.1.0-chromium.zip`.
- [ ] Publicar o pacote na Chrome Web Store.
- [ ] Registrar o ID oficial atribuído pelo Chrome.
- [ ] Publicar o mesmo pacote no Microsoft Edge Add-ons.
- [ ] Registrar o ID oficial atribuído pelo Edge.
- [ ] Validar a instalação oficial e a origem/ID efetivamente usados pelo Brave; não presumir que sejam iguais aos do Chrome.
- [ ] Definir `AURI_EXTENSION_CHROME_ID`, `AURI_EXTENSION_EDGE_ID` e `AURI_EXTENSION_BRAVE_ID` no release do Auri Desktop.
- [ ] Gerar o Setup definitivo do Auri Desktop 1.10.0.
- [ ] Executar o E2E de produção com os IDs oficiais.
- [ ] Publicar o release final somente depois das validações anteriores.

Os IDs oficiais serão obtidos durante o processo de distribuição. IDs unpacked, DEV ou de teste não devem ser reutilizados.
