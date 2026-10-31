# Relatorio de continuidade - Trilha Redes

Data do registro: 31/10/2026

## Visao geral

O projeto e um jogo de trilha em arquitetura cliente-servidor para a disciplina de Redes de Computadores. O estado oficial fica no servidor Node.js; o cliente Node usa sockets TCP e UDP reais; a interface React/Vite conversa apenas com o cliente local por HTTP/SSE.

O jogo suporta de 1 a 3 equipes, preservando a solicitacao de permitir partida solo. Para uma demonstracao academica com varios participantes, devem ser conectadas tres equipes.

## Estrutura principal

- `server/src/index.ts`: servidor oficial TCP/UDP, regras, turnos, validacoes e logs.
- `client/src/index.ts`: cliente de rede TCP/UDP e ponte local para a interface.
- `web/src/App.tsx`: interface React.
- `web/src/style.css`: estilo cyberpunk e minimapa em trilha serpenteada.
- `questions.json`: banco local de perguntas.
- `README.md`: instrucoes de execucao, protocolo e Wireshark.
- `config.example.json`: configuracao de exemplo.
- `TESTES.md`: relatorio de testes com validacao de TCP, UDP, desconexao e sorteio inicial.

## Funcionalidades implementadas

- Cadastro com nome da equipe, participantes, porta UDP e escolha de peao 3D.
- Limite de tres equipes e bloqueio de peoes ja ocupados.
- Votacao coletiva antes de iniciar a partida.
- Sorteio inicial com cinco fichas ocultas: cada equipe escolhe uma, os valores sao revelados juntos e a ordem dos turnos e definida do maior para o menor.
- Turnos coordenados pelo servidor.
- Escolha de assunto apenas no primeiro turno de cada equipe; nos turnos seguintes, a casa atual define a categoria.
- Escolha de ficha de 1 a 5; fichas sao consumidas e renovadas quando todas acabam.
- Apos 40 segundos sem escolher ficha, o servidor seleciona a maior ficha disponivel.
- Apos 80 segundos sem resposta, o turno termina e a ficha ja escolhida e perdida.
- Perguntas de Hardware, Software e Redes carregadas de JSON, com preferencia por nao repetir perguntas na mesma partida.
- Tabuleiro em formato de minimapa serpenteado, com inicio e fim, casas quadradas, peoes sobre as casas, placar e pop-ups de turno/pergunta.
- Comemoracao de acerto e encerramento da partida, incluindo retorno ao lobby.
- Logs de TCP, UDP e eventos de jogo em `logs/`.

## Ajustes tecnicos realizados nesta sessao

1. Corrigido o tratamento de desconexao de equipes:
   - uma desconexao no lobby remove a equipe corretamente;
   - uma desconexao durante partida marca a equipe como desconectada;
   - se a equipe desconectada estava no turno, o turno e encerrado;
   - se todas se desconectarem, a partida e finalizada sem recursao infinita.

2. Corrigido o envio UDP para clientes IPv4 conectados por endereco IPv4-mapeado (`::ffff:127.0.0.1`): o servidor normaliza o destino para `127.0.0.1` antes do envio.

3. Corrigida a porta UDP do servidor:
   - o socket UDP agora faz `bind` na porta fixa `4001`;
   - antes disso, os avisos podiam sair de uma porta efemera, mesmo sendo registrados como porta 4001;
   - erros do socket UDP agora tambem sao registrados no log.

4. Documentacao atualizada:
   - `README.md` foi refeito com arquitetura, portas, configuracao, mensagens TCP/UDP, regras, logs e roteiro para Wireshark;
   - `config.example.json` passou a expor somente configuracoes que o projeto realmente respeita;
   - TCP e UDP permanecem em portas fixas `4000` e `4001`.

5. Base de perguntas validada:
   - 90 perguntas no total;
   - 30 de Hardware (`H`), 30 de Software (`S`) e 30 de Redes (`R`);
   - IDs unicos e quatro alternativas por pergunta.

## Estado da verificacao

### Validacoes concluidas

- Compilacao do servidor concluida com sucesso apos os ajustes (`npm run build -w server`).
- Em verificacao anterior, a compilacao de servidor, cliente e interface foi concluida.
- Teste ponta a ponta solo anterior aprovado: 10 turnos, chegada a casa 30, vitoria e retorno ao lobby confirmados.
- Logs do teste com tres clientes mostraram cadastro, voto de inicio, inicio de turno, escolha de categoria, ficha, resposta, avanco, troca de turno e desconexao.
- Validacao final em 31/10 aprovada: `npm run build` compilou servidor, cliente e interface; o detector visual retornou `[]`.

### Teste com tres clientes e UDP

O teste automatizado final usou tres sockets TCP e tres sockets UDP reais, com `bind` local nas portas 6311, 6312 e 6313. As tres equipes foram cadastradas, votaram para iniciar, executaram dois turnos e receberam resultados TCP.

A repeticao confirmou o recebimento: cada cliente recebeu 12 datagramas, incluindo `start_vote_opened`, `game_start`, `turn_ready`, `turn_start`, `turn_end` e `advance`. A equipe ativa foi desconectada durante a partida; o servidor encerrou o turno e preparou o proximo turno conectado.

## Processos em execucao no momento deste registro

- O servidor usado na validacao foi encerrado ao final do teste para nao deixar um processo auxiliar ativo.
- Nenhum processo de cliente local foi iniciado nesta validacao.

Antes de continuar os testes, confirme as portas com PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 4000,5175 -State Listen
Get-NetUDPEndpoint -LocalPort 4001
```

## Pendencias restantes

1. Gerar uma captura real `pcapng` com Wireshark e colocala em uma pasta `evidencias/`.
   - Nesta maquina, `dumpcap`, `tshark` e `wireshark` nao estavam disponiveis no PATH; por isso nenhuma captura artificial foi criada.
   - O README contem um roteiro de captura e filtro para TCP/UDP.
2. Preencher no README os nomes dos integrantes antes da entrega.

## Comandos uteis

```powershell
npm install
npm run build
npm run dev:server
npm run dev:client
npm run dev:web
```

Em maquinas diferentes, informe no cliente o IP ou hostname do servidor. As portas do protocolo sao fixas: TCP `4000` e UDP `4001`; a interface local do cliente usa a porta `5175`.
