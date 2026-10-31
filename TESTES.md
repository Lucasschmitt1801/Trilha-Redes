# Relatório de testes — Trilha Redes

Data da validação mais recente: 31/10/2026 (Windows, Node.js 22)

| Cenário | Procedimento | Resultado |
|---|---|---|
| Compilação | `npm run build` | Aprovado: servidor, cliente e React/Vite compilam sem erros. |
| JSON Lines / buffering TCP | Três sockets enviaram o cadastro com a primeira mensagem dividida em dois `write`s. | Aprovado: o servidor recompôs e processou os três cadastros. |
| Quantidade de equipes | Cadastro e início com três equipes; a implementação também aceita partida solo. | Aprovado: limite de três equipes e fluxo de votação coletiva funcionando. |
| Fluxo de turno | Três clientes TCP reais registraram equipes, votaram, executaram dois turnos e receberam `answer_result`. | Aprovado: respostas processadas, avanço publicado quando correto e troca de turno confirmada. |
| UDP | Três sockets UDP fizeram `bind` local nas portas 6311, 6312 e 6313. | Aprovado: cada cliente recebeu 12 datagramas, incluindo `start_vote_opened`, `game_start`, `turn_ready`, `turn_start`, `turn_end` e `advance`. |
| Desconexão durante partida | A equipe cujo turno estava ativo foi desconectada antes de responder. | Aprovado: o servidor registrou `disconnect`, encerrou o turno com motivo `desconectou` e preparou o turno da próxima equipe conectada. |
| Autoridade | Ficha/resposta fora do turno, fase errada, dados inválidos e JSON malformado são rejeitados. | Implementado no servidor. |

Evidências:

- Log do servidor: `logs/server-2026-10-31.log`.
- Execução de três clientes: cada cliente recebeu 12 mensagens UDP; a validação terminou com `ok: true`.
## Validacao do sorteio inicial

Teste automatizado com tres clientes TCP e UDP reais: cada equipe escolheu uma ficha oculta; nenhum valor apareceu no estado antes da revelacao. Depois da escolha das tres equipes, os valores foram revelados, ordenados do maior para o menor e o primeiro turno foi entregue ao vencedor do sorteio. Resultado: aprovado.
