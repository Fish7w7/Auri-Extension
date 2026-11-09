# Changelog

## 0.3.2

- Detecta o capítulo nas URLs de leitura do ToonLivre e consulta o título da aba quando `og:title` traz apenas o nome da obra.
- Usa Auri Protocol 0.2.1 com Zod 4.6.6. O protocolo wire v1 e as permissões `activeTab`, `scripting` e `nativeMessaging` são os mesmos.

## 0.3.1

- Confirma o progresso com uma releitura do Auri e diferencia atualização recusada de entrega incerta.
- Bloqueia alterações para correspondências fracas e preserva a leitura em versões anteriores do Desktop.
- Melhora o feedback de validação e os anúncios de progresso para tecnologias assistivas.

## 0.3.0

- Adiciona a consulta de contexto de leitura com o Auri Desktop 1.14.
- Permite continuar pela última página conhecida e atualizar o capítulo pelo navegador.
- Preserva o fallback para versões anteriores do Desktop, as três variantes de distribuição e os idiomas English e Português (Brasil).
