# Changelog

## 0.4.0

### Novidades

- O popup foi redesenhado com 400 px de largura. O cartão de leitura mostra lado a lado o capítulo salvo na biblioteca e o detectado na página, com uma indicação de como eles se relacionam.
- O título da obra, o estado de leitura e a fonte ganharam posições distintas. A ação principal recebe destaque conforme o contexto da página.
- O cabeçalho combina texto e ícone para indicar a conexão com o Desktop. O cartão acompanha a atualização de progresso até a confirmação na biblioteca.
- Mensagens de erro e desconexão apresentam a orientação correspondente. Quando há várias obras possíveis, a lista mostra o título e o capítulo de cada candidata.

### Melhorias técnicas

- A refatoração do popup em React separa os componentes visuais da lógica de leitura. Hooks dedicados gerenciam a sessão, as ações pendentes e o feedback.
- Os estilos compartilham cores, tipografia, espaçamentos e estados dos controles.
- Títulos e fontes longos podem ocupar várias linhas. A interface se adapta a larguras menores e mantém os controles acessíveis por teclado e rolagem.

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
