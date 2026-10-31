# Trilha Redes

Aplicacao cliente-servidor para a disciplina **Redes de Computadores: Aplicacao e Transporte**.

Professor: Elvandi da Silva Junior  
Integrantes: **preencher antes da entrega**

## Visao geral

Trilha Redes e um jogo de perguntas em rede. O servidor mantem o estado oficial: equipes, turnos, perguntas, fichas, posicoes, temporizadores, placar e resultado. Cada equipe usa um cliente Node.js; a interface React conversa apenas com esse cliente local por HTTP/SSE.

O projeto suporta de 1 a 3 equipes. Para a demonstracao do trabalho, execute tres clientes ativos, cada um em sua propria maquina ou instancia. Depois da votacao, um sorteio com cinco fichas ocultas define a ordem inicial.

```text
Navegador React <-> HTTP/SSE local <-> Cliente Node <-> TCP JSON Lines <-> Servidor Node
                                                    ^
                                                    | UDP: avisos nao oficiais
                                                    +-----------------------
```

## Tecnologias

- Node.js 20 ou superior e TypeScript
- Sockets nativos `node:net` (TCP) e `node:dgram` (UDP)
- React, Vite e TypeScript para a interface

## Portas e enderecos

| Funcao | Protocolo | Porta | Configuracao |
|---|---:|---:|---|
| Servidor do jogo | TCP | 4000 | Fixa |
| Avisos do servidor | UDP | 4001 | Fixa no servidor; cada cliente informa sua porta UDP local no cadastro |
| Ponte local cliente-interface | HTTP/SSE | 5175 | Fixa, somente na maquina do cliente |
| Interface web embutida no cliente | HTTP | 5175 | Servida pelo cliente local |
| Interface Vite | HTTP | 5173 | Opcional, somente para desenvolvimento |

O IP ou hostname do servidor e configurado no botao **Configurar** do lobby. Em outra maquina da mesma LAN, informe o IP LAN da maquina que executa o servidor, por exemplo `192.168.1.50`.

## Instalacao e execucao

```powershell
npm install
Copy-Item config.example.json config.json
npm run build
```

No computador servidor:

```powershell
npm run start:server
```

Em cada computador cliente:

```powershell
npm run start:client
npm run dev:web
```

Abra `http://127.0.0.1:5175` depois de iniciar o cliente. O cliente serve a interface web compilada nessa mesma porta; `npm run dev:web` continua disponível apenas para desenvolvimento. Cadastre uma equipe com nome, participantes e um peao exclusivo. Para demonstracao com tres equipes, abra tres instancias de cliente/interface e use peoes distintos.

### Executaveis Windows

Os launchers `executables/server.exe` e `executables/client.exe` iniciam os modulos compilados do servidor e do cliente. As versoes `executables/server.bat` e `executables/client.bat` sao recomendadas para testes, pois mantem a janela aberta e mostram erros como porta ocupada. Depois de iniciar os dois, abra `http://127.0.0.1:5175`; nao e necessario iniciar o Vite separadamente. Todos usam o Node.js instalado no sistema e devem permanecer dentro desta estrutura de projeto, com `questions.json`, `config.json` e `logs/` na raiz.

## Configuracao da partida

`config.json` aceita as configuracoes abaixo. As portas TCP e UDP do protocolo sao fixas e documentadas acima.

```json
{
  "serverHost": "127.0.0.1",
  "boardSize": 30,
  "maxRounds": 50,
  "totalGameSeconds": 3600
}
```

## Protocolo de aplicacao

Todas as mensagens TCP sao objetos JSON em UTF-8, terminados por `\n` (JSON Lines). Cliente e servidor acumulam dados recebidos ate encontrar o delimitador; um `data`/`recv` nunca e tratado como mensagem completa por si so.

### TCP: cliente para servidor

| Tipo | Campos principais | Finalidade |
|---|---|---|
| `register` | `name`, `participants`, `pawnSkin`, `udpPort` | Cadastra a equipe e a porta UDP local. |
| `start_game` | - | Abre a confirmacao coletiva de inicio. |
| `vote_start` | - | Confirma o inicio da partida. |
| `choose_draw_card` | `cardId`: 0 a 4 | Escolhe uma das cinco fichas ocultas do sorteio inicial. |
| `start_turn` | - | Inicia o turno da equipe ativa. |
| `choose_category` | `category`: `H`, `S` ou `R` | Escolhe o assunto no primeiro turno. |
| `choose_token` | `token`: 1 a 5 | Escolhe a ficha disponivel. |
| `answer` | `answer`: 0 a 3 | Envia uma alternativa. |
| `return_lobby` | - | Reinicia a sessao apos o encerramento. |

Exemplo de cadastro:

```json
{"type":"register","name":"Equipe Alpha","participants":["Ana","Bruno"],"pawnSkin":"cyan","udpPort":54001}
```

Exemplo de resposta:

```json
{"type":"answer","answer":2}
```

### TCP: servidor para cliente

| Tipo | Finalidade |
|---|---|
| `registered` | Confirma o cadastro e retorna o identificador da equipe. |
| `state` | Estado oficial completo: tabuleiro, equipes, sorteio, turno, temporizador, pergunta e historico. |
| `answer_result` | Informa acerto/erro, alternativa correta e posicao resultante. |
| `game_over` | Retorna vencedores e ranking. |
| `lobby_reset` | Limpa a sessao local apos o retorno ao lobby. |
| `error` | Rejeita uma operacao invalida com mensagem explicativa. |

Exemplo de erro:

```json
{"type":"error","message":"Acao fora do seu turno."}
```

### UDP: servidor para cliente

Os datagramas UDP sao avisos JSON em UTF-8. Eles nao confirmam operacoes e nao substituem o estado oficial, que continua disponivel em `state` por TCP.

Tipos emitidos: `start_vote_opened`, `game_start`, `draw_start`, `draw_pick`, `draw_reveal`, `turn_ready`, `turn_start`, `token_auto_selected`, `turn_end`, `advance` e `game_end`.

Exemplo:

```json
{"type":"advance","teamId":"uuid-da-equipe","steps":4,"position":18}
```

## Regras implementadas

- O servidor e a unica fonte de verdade do estado.
- O inicio exige confirmacao das equipes cadastradas.
- Depois da votacao, cada equipe escolhe uma ficha entre cinco fichas viradas para baixo. Os valores de 1 a 5 so sao revelados quando todas as equipes escolherem; a maior ficha inicia, seguida pelas demais em ordem decrescente. Empates usam a ordem de cadastro.
- No primeiro turno, a equipe seleciona Hardware, Software ou Redes. Nos demais, a casa atual define a categoria.
- Ha 40 segundos para a ficha. Se expirar, o servidor usa a maior ficha disponivel.
- Ha 80 segundos para responder. Sem resposta, a equipe perde a vez e a ficha permanece consumida.
- Fichas de 1 a 5 sao consumidas; ao usar a ultima, o conjunto e renovado.
- As fichas do sorteio e as fichas escolhidas durante os turnos usam a mesma linguagem visual de fichas de poker na interface.
- Perguntas sao carregadas de `questions.json`: 30 de Hardware, 30 de Software e 30 de Redes.
- A equipe vence ao atingir ou ultrapassar a ultima casa; empate e suportado.
- Mensagens malformadas, acoes fora de turno, fichas invalidas e respostas invalidas sao rejeitadas sem derrubar o servidor.
- Uma equipe que desconecta antes da partida e removida do lobby. Durante a partida, ela e marcada como desconectada e os turnos restantes continuam para as equipes ativas.

## Logs

Os logs sao gravados em `logs/` no formato:

```text
horario | protocolo | direcao | origem -> destino | tipo | detalhe
```

Eles registram trafego TCP/UDP, cadastro, inicio/fim de jogo, turnos, fichas, respostas, acertos, erros, avancos, desconexoes e retorno ao lobby.

## Testes

Consulte [TESTES.md](TESTES.md). Antes da entrega, execute e salve os logs da demonstracao com tres clientes, incluindo uma resposta correta, uma incorreta, uma operacao invalida e uma desconexao.

## Captura no Wireshark

1. Inicie o servidor e tres clientes.
2. Abra o Wireshark na interface de rede usada. Para testes locais, use a interface de loopback/Npcap Loopback Adapter.
3. Aplique o filtro: `tcp.port == 4000 || udp.port == 4001`.
4. Envie um cadastro, inicie um turno e responda uma pergunta para gerar trafego TCP e UDP.
5. Em um pacote TCP, use **Follow > TCP Stream** para visualizar os JSON Lines.
6. Em um pacote UDP, confirme um aviso de turno ou avanco.
7. Salve em `evidencias/trilha-redes.pcapng` e inclua o arquivo no ZIP de entrega.

> Nesta maquina nao foi encontrado `dumpcap`, `tshark` ou Wireshark para gerar a captura automaticamente. A captura deve ser feita na maquina de demonstracao seguindo os passos acima.

## Checklist de entrega

- [ ] Preencher os nomes dos integrantes neste README.
- [ ] Incluir logs de uma execucao com tres clientes.
- [ ] Incluir `evidencias/trilha-redes.pcapng`.
- [ ] Incluir este codigo-fonte, `questions.json`, `README.md` e `TESTES.md` no arquivo ZIP.
