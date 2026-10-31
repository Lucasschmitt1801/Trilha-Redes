/*
 * SERVIDOR DO JOGO - roteiro rapido para apresentacao
 *
 * 1. TCP recebe comandos JSON das equipes e envia snapshots do estado.
 * 2. O servidor e a fonte oficial da verdade: valida turnos, fichas,
 *    respostas, sorteio e condicoes de encerramento.
 * 3. UDP transmite notificacoes de eventos para as equipes.
 * 4. O sorteio usa cinco fichas ocultas; depois que todas sao escolhidas,
 *    os valores sao revelados e a ordem dos turnos e calculada.
 * 5. Os timers impedem que uma equipe bloqueie a partida indefinidamente.
 */
import net from "node:net";
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Descobrimos a raiz a partir do arquivo compilado, inclusive quando executado pelo .exe.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const configPath = path.join(root, "config.json");
const defaults = { tcpPort: 4000, udpPort: 4001, boardSize: 30, maxRounds: 50, totalGameSeconds: 3600 };
const settings = fs.existsSync(configPath) ? { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")), tcpPort: 4000, udpPort: 4001 } : defaults;
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const logsDir = path.join(root, "logs");
fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, `server-${new Date().toISOString().slice(0, 10)}.log`);
const log = (protocol, direction, origin, destination, type, detail = "") => fs.appendFileSync(logFile, `${new Date().toISOString()} | ${protocol} | ${direction} | ${origin} -> ${destination} | ${type} | ${detail}\n`);
const categories = ["H", "S", "R"];
const MAX_TEAMS = 3;
const colors = { H: "#f5c542", S: "#e95cff", R: "#37e8ff" };
const board = Array.from({ length: settings.boardSize + 1 }, (_, position) => ({ position, category: categories[position % categories.length], color: colors[categories[position % categories.length]] }));
// Estado em memoria da partida atual: equipes, conexoes e perguntas ja usadas.
const teams = [];
const peers = new Set();
const usedQuestions = new Set();
let gameStarted = false, gameEnded = false, startVoteActive = false, currentIndex = 0, rounds = 0, turn, gameTimer;
let drawPhase, drawTimer, drawValues = [], drawSelections = new Map(), drawCardOwners = new Map(), drawOrder = [], turnOrder = [], turnOrderIndex = 0;
const history = [];
const udp = dgram.createSocket("udp4");
udp.on("error", error => log("UDP", "ERROR", `server:${settings.udpPort}`, "server", "socket_error", error.message));
udp.bind(settings.udpPort, () => log("UDP", "LOCAL", `server:${settings.udpPort}`, "server", "listening", String(settings.udpPort)));
// O protocolo TCP usa uma mensagem JSON por linha, facil de separar no cliente.
function send(socket, message) { if (!socket.destroyed)
    socket.write(JSON.stringify(message) + "\n"); }
// Mantem os valores do sorteio escondidos ate a fase de revelacao.
function drawSnapshot() {
    if (!drawPhase)
        return undefined;
    const selections = [...drawSelections.entries()].map(([teamId, cardId]) => ({ teamId, cardId, ...(drawPhase === "reveal" ? { value: drawValues[cardId] } : {}) }));
    return { phase: drawPhase, cards: drawValues.map((_, cardId) => { const teamId = drawCardOwners.get(cardId); return { id: cardId, selected: teamId !== undefined, ...(drawPhase === "reveal" && teamId !== undefined ? { teamId, value: drawValues[cardId] } : {}) }; }), selections, order: drawPhase === "reveal" ? drawOrder : undefined };
}
// Snapshot e a fotografia publica enviada para todas as telas conectadas.
function snapshot() { return { type: "state", gameStarted, gameEnded, startVoteActive, board, teams: teams.map(({ socket, ...t }) => ({ ...t, socket: undefined })), currentTeamId: turn?.teamId, phase: turn?.phase, deadlineAt: turn && turn.phase !== "ready" ? turn.startedAt + (turn.phase === "answer" ? 80_000 : 40_000) : undefined, currentCategory: turn?.category, question: turn?.question ? { id: turn.question.id, category: turn.question.category, statement: turn.question.statement, options: turn.question.options } : undefined, token: turn?.token, draw: drawSnapshot(), history, settings: { boardSize: settings.boardSize } }; }
function broadcast(message) { peers.forEach(socket => send(socket, message)); }
function sync() { broadcast(snapshot()); }
// UDP e apenas uma notificacao de evento; o estado confiavel continua no TCP/snapshot.
function udpNotice(type, payload = {}) { teams.forEach(team => { if (!team.udpPort || !team.address)
    return; const address = team.address.startsWith("::ffff:") ? team.address.slice(7) : team.address; const msg = Buffer.from(JSON.stringify({ type, ...payload }), "utf8"); udp.send(msg, team.udpPort, address, error => { if (error)
    log("UDP", "ERROR", `server:${settings.udpPort}`, `${address}:${team.udpPort}`, type, error.message); }); log("UDP", "OUT", `server:${settings.udpPort}`, `${address}:${team.udpPort}`, type); }); }
function publicTeam(team) { const { socket, ...safe } = team; return safe; }
function chooseQuestion(category) { const matching = questions.filter(q => q.category === category && !usedQuestions.has(q.id)); const pool = matching.length ? matching : questions.filter(q => q.category === category); const q = pool[Math.floor(Math.random() * pool.length)]; usedQuestions.add(q.id); return q; }
function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }
function drawParticipants() { return teams.filter(team => team.connected); }
function allDrawsSelected() { const participants = drawParticipants(); return participants.length > 0 && participants.every(team => drawSelections.has(team.id)); }
// Quando todas as equipes escolheram, revela os valores e cria a ordem dos turnos.
function resolveDraw() {
    if (drawPhase !== "select" || !allDrawsSelected())
        return;
    const participants = drawParticipants().filter(team => drawSelections.has(team.id));
    const ranked = participants.map(team => ({ team, cardId: drawSelections.get(team.id), value: drawValues[drawSelections.get(team.id)] })).sort((a, b) => b.value - a.value || teams.indexOf(a.team) - teams.indexOf(b.team));
    drawOrder = ranked.map(item => item.team.id);
    turnOrder = [...drawOrder];
    turnOrderIndex = 0;
    drawPhase = "reveal";
    history.unshift(`Sorteio concluído: ${ranked.map((item, index) => `${index + 1}º ${item.team.name} (${item.value})`).join(", ")}.`);
    log("GAME", "LOCAL", "server", "game", "draw_reveal", ranked.map(item => `${item.team.name}:${item.value}`).join(", "));
    udpNotice("draw_reveal", { results: ranked.map(item => ({ teamId: item.team.id, value: item.value, position: ranked.indexOf(item) + 1 })) });
    sync();
    drawTimer = setTimeout(() => { drawPhase = undefined; drawTimer = undefined; prepareTurn(); }, 3_500);
}
// Inicia o sorteio com cinco fichas ocultas e limpa selecoes antigas.
function beginDraw() {
    drawPhase = "select";
    drawTimer = undefined;
    drawValues = shuffle([1, 2, 3, 4, 5]);
    drawSelections = new Map();
    drawCardOwners = new Map();
    drawOrder = [];
    turnOrder = [];
    turnOrderIndex = 0;
    history.unshift("Sorteio da ordem de jogo aberto: cada equipe deve escolher uma ficha.");
    log("GAME", "LOCAL", "server", "game", "draw_start", `${drawParticipants().length} teams`);
    udpNotice("draw_start", { cards: 5 });
    sync();
}
function setTimer(ms, callback) { if (turn?.timer)
    clearTimeout(turn.timer); if (turn)
    turn.timer = setTimeout(callback, ms); }
function advanceTurn(team, reason, nextTurnDelay = 800) { history.unshift(`${team.name}: ${reason}`); log("GAME", "LOCAL", "server", "game", "turn_end", `${team.name}; ${reason}`); udpNotice("turn_end", { teamId: team.id, reason }); rounds++; turn = undefined; if (teams.some(t => t.position >= settings.boardSize) || rounds >= settings.maxRounds)
    return finishGame(); if (turnOrder.length)
    turnOrderIndex = (turnOrderIndex + 1) % turnOrder.length;
else
    currentIndex = (currentIndex + 1) % teams.length; sync(); setTimeout(prepareTurn, nextTurnDelay); }
function endTurn(reason) { if (!turn || gameEnded)
    return; if (turn.timer)
    clearTimeout(turn.timer); const team = teams.find(t => t.id === turn.teamId); advanceTurn(team, reason); }
function prepareTurn() { if (gameEnded || !teams.length)
    return; const order = turnOrder.length ? turnOrder : teams.map(team => team.id); let attempts = 0; let team; while (attempts < order.length) {
    const candidate = teams.find(item => item.id === order[turnOrder.length ? turnOrderIndex : currentIndex]);
    if (candidate?.connected) {
        team = candidate;
        break;
    }
    if (turnOrder.length)
        turnOrderIndex = (turnOrderIndex + 1) % order.length;
    else
        currentIndex = (currentIndex + 1) % order.length;
    attempts++;
} if (!team) {
    history.unshift("Partida encerrada: não há equipes conectadas.");
    log("GAME", "LOCAL", "server", "game", "game_end_no_clients");
    return finishGame();
} turn = { teamId: team.id, phase: "ready", startedAt: Date.now() }; history.unshift(`${team.name}: pronto para iniciar o turno.`); log("GAME", "LOCAL", "server", "game", "turn_ready", team.name); udpNotice("turn_ready", { teamId: team.id }); sync(); }
function commitToken(team, token, automatic = false) { if (!turn || !turn.question)
    return; turn.token = token; turn.phase = "answer"; turn.startedAt = Date.now(); team.tokens = team.tokens.filter(item => item !== token); const renewed = team.tokens.length === 0; if (renewed)
    team.tokens = [1, 2, 3, 4, 5]; const detail = automatic ? `${team.name} não escolheu ficha; sistema aplicou a ficha ${token}.` : `${team.name} escolheu a ficha ${token}.`; history.unshift(renewed ? `${detail} Fichas renovadas.` : detail); log("GAME", "LOCAL", "server", "game", automatic ? "token_auto_selected" : "token_chosen", `${team.name}; ${token}; ${renewed ? "renewed" : "used"}`); if (automatic)
    udpNotice("token_auto_selected", { teamId: team.id, token }); sync(); setTimer(80_000, () => endTurn(`não respondeu em 80 segundos e perdeu a ficha ${token}`)); }
function scheduleTokenDeadline(team) { setTimer(40_000, () => { if (!turn || turn.teamId !== team.id || turn.phase !== "token")
    return; commitToken(team, Math.max(...team.tokens), true); }); }
function activateTurn(team) { if (!turn || turn.phase !== "ready")
    return; if (!team.initialTopicChosen) {
    turn.phase = "category";
    turn.startedAt = Date.now();
    history.unshift(`Primeiro turno de ${team.name}: escolha o assunto e a ficha.`);
    log("GAME", "LOCAL", "server", "game", "turn_start", `${team.name}; choose initial category`);
    udpNotice("turn_start", { teamId: team.id, phase: "category" });
    sync();
    return setTimer(40_000, () => endTurn("não escolheu assunto e ficha em 40 segundos"));
} const category = board[Math.min(team.position, settings.boardSize)].category; turn.category = category; turn.question = chooseQuestion(category); turn.phase = "token"; turn.startedAt = Date.now(); history.unshift(`Turno de ${team.name}: categoria ${category} definida pela casa ${team.position}.`); log("GAME", "LOCAL", "server", "game", "turn_start", `${team.name}; board category ${category}`); udpNotice("turn_start", { teamId: team.id, category, phase: "token" }); sync(); scheduleTokenDeadline(team); }
function finishGame() { if (gameEnded)
    return; gameEnded = true; if (turn?.timer)
    clearTimeout(turn.timer); if (gameTimer)
    clearTimeout(gameTimer); if (drawTimer)
    clearTimeout(drawTimer); drawTimer = undefined; drawPhase = undefined; const max = Math.max(...teams.map(t => t.position)); const winners = teams.filter(t => t.position === max).map(publicTeam); history.unshift(winners.length === 1 ? `${winners[0].name} venceu a partida!` : "A partida terminou em empate."); log("GAME", "LOCAL", "server", "game", "game_end", winners.map(w => w.name).join(", ")); udpNotice("game_end", { winners }); broadcast({ type: "game_over", winners, ranking: [...teams].sort((a, b) => b.position - a.position).map(publicTeam) }); sync(); }
function activateGame() { startVoteActive = false; gameStarted = true; history.unshift("Partida iniciada com aprovação de todas as equipes."); log("GAME", "LOCAL", "server", "game", "game_start", `${teams.length} teams`); udpNotice("game_start"); gameTimer = setTimeout(() => finishGame(), settings.totalGameSeconds * 1000); beginDraw(); }
function resetToLobby() { if (turn?.timer)
    clearTimeout(turn.timer); if (gameTimer)
    clearTimeout(gameTimer); if (drawTimer)
    clearTimeout(drawTimer); broadcast({ type: "lobby_reset" }); log("GAME", "LOCAL", "server", "game", "lobby_reset"); teams.length = 0; usedQuestions.clear(); history.length = 0; gameStarted = false; gameEnded = false; startVoteActive = false; currentIndex = 0; rounds = 0; turn = undefined; gameTimer = undefined; drawTimer = undefined; drawPhase = undefined; drawValues = []; drawSelections.clear(); drawCardOwners.clear(); drawOrder = []; turnOrder = []; turnOrderIndex = 0; }
// Roteador de comandos: toda mudanca de estado passa por estas validacoes.
function handle(team, msg, socket) {
    if (!msg || typeof msg.type !== "string")
        return send(socket, { type: "error", message: "Mensagem inválida." });
    if (msg.type === "register") {
        if (teams.length >= MAX_TEAMS)
            return send(socket, { type: "error", message: "Limite de 3 equipes atingido." });
        if (gameStarted || team)
            return send(socket, { type: "error", message: "Cadastro não permitido." });
        const name = String(msg.name || "").trim(), emoji = "◈", participants = Array.isArray(msg.participants) ? msg.participants.map(String).filter(Boolean) : [];
        const udpPort = Number(msg.udpPort), pawnSkin = String(msg.pawnSkin || "");
        if (!name || !participants.length || !Number.isInteger(udpPort) || !["cyan", "magenta", "gold"].includes(pawnSkin))
            return send(socket, { type: "error", message: "Informe equipe, participantes, peão 3D e porta UDP válidos." });
        if (teams.some(t => t.pawnSkin === pawnSkin))
            return send(socket, { type: "error", message: "Este peão 3D já foi escolhido por outra equipe." });
        if (teams.some(t => t.name.toLowerCase() === name.toLowerCase()))
            return send(socket, { type: "error", message: "Nome de equipe já existe." });
        const added = { id: crypto.randomUUID(), name, emoji, pawnSkin: pawnSkin, participants, position: 0, tokens: [1, 2, 3, 4, 5], initialTopicChosen: false, startConfirmed: false, socket, udpPort, address: socket.remoteAddress, connected: true };
        teams.push(added);
        socket.teamId = added.id;
        log("TCP", "IN", String(socket.remoteAddress), "server", "register", `${name}; pawn ${pawnSkin}; start 0`);
        send(socket, { type: "registered", team: publicTeam(added) });
        sync();
        return;
    }
    if (msg.type === "start_game") {
        if (!team || gameStarted)
            return send(socket, { type: "error", message: "Início de partida não permitido." });
        if (teams.length < 1)
            return send(socket, { type: "error", message: "É necessária ao menos uma equipe." });
        if (!startVoteActive) {
            startVoteActive = true;
            teams.forEach(item => item.startConfirmed = false);
            history.unshift(`${team.name} solicitou o início da partida.`);
            log("GAME", "LOCAL", "server", "game", "start_vote_opened", team.name);
            udpNotice("start_vote_opened", { teamId: team.id });
            sync();
        }
        return;
    }
    if (msg.type === "vote_start") {
        if (!team || !startVoteActive || gameStarted)
            return send(socket, { type: "error", message: "Votação de início indisponível." });
        team.startConfirmed = true;
        history.unshift(`${team.name} confirmou o início.`);
        log("GAME", "LOCAL", "server", "game", "start_vote", team.name);
        sync();
        if (teams.length > 0 && teams.every(item => item.startConfirmed))
            return activateGame();
        return;
    }
    if (msg.type === "choose_draw_card") {
        const cardId = Number(msg.cardId);
        if (!team || !drawPhase || drawPhase !== "select")
            return send(socket, { type: "error", message: "O sorteio não está disponível." });
        if (drawSelections.has(team.id))
            return send(socket, { type: "error", message: "Sua equipe já escolheu uma ficha no sorteio." });
        if (!Number.isInteger(cardId) || cardId < 0 || cardId >= drawValues.length || drawCardOwners.has(cardId))
            return send(socket, { type: "error", message: "Esta ficha já foi escolhida ou é inválida." });
        drawSelections.set(team.id, cardId);
        drawCardOwners.set(cardId, team.id);
        history.unshift(`${team.name} escolheu uma ficha virada para baixo.`);
        log("GAME", "LOCAL", "server", "game", "draw_pick", `${team.name}; card ${cardId}`);
        udpNotice("draw_pick", { teamId: team.id });
        if (allDrawsSelected())
            return resolveDraw();
        sync();
        return;
    }
    if (msg.type === "return_lobby") {
        if (!team || !gameEnded)
            return send(socket, { type: "error", message: "O retorno ao lobby só está disponível após o fim da partida." });
        return resetToLobby();
    }
    if (!team || !turn || team.id !== turn.teamId)
        return send(socket, { type: "error", message: "Ação fora do seu turno." });
    if (msg.type === "start_turn") {
        if (turn.phase !== "ready")
            return send(socket, { type: "error", message: "Turno já iniciado ou inválido." });
        return activateTurn(team);
    }
    if (msg.type === "choose_category") {
        const category = String(msg.category);
        if (turn.phase !== "category" || team.initialTopicChosen || !categories.includes(category))
            return send(socket, { type: "error", message: "Assunto inválido ou fora de fase." });
        team.initialTopicChosen = true;
        turn.category = category;
        turn.question = chooseQuestion(category);
        turn.phase = "token";
        turn.startedAt = Date.now();
        history.unshift(`${team.name} escolheu ${category} para seu primeiro turno. Agora selecione a ficha.`);
        log("GAME", "LOCAL", "server", "game", "initial_category_chosen", `${team.name}; ${category}`);
        sync();
        scheduleTokenDeadline(team);
        return;
    }
    if (msg.type === "choose_token") {
        const token = Number(msg.token);
        if (turn.phase !== "token" || !turn.question || !Number.isInteger(token) || !team.tokens.includes(token))
            return send(socket, { type: "error", message: "Ficha indisponível ou fora de fase." });
        return commitToken(team, token);
    }
    if (msg.type === "answer") {
        const answer = Number(msg.answer);
        if (turn.phase !== "answer" || !turn.question || !Number.isInteger(answer) || answer < 0 || answer > 3)
            return send(socket, { type: "error", message: "Resposta inválida ou fora de fase." });
        const correct = answer === turn.question.correctIndex;
        const correctOption = turn.question.options[turn.question.correctIndex];
        log("GAME", "LOCAL", "server", "game", "answer", `${team.name}; ${answer}; ${correct ? "correct" : "wrong"}`);
        if (correct) {
            team.position += turn.token;
            history.unshift(`${team.name} acertou e avançou ${turn.token} casa(s)!`);
            udpNotice("advance", { teamId: team.id, steps: turn.token, position: team.position });
        }
        else
            history.unshift(`${team.name} errou e permaneceu na casa ${team.position}.`);
        broadcast({ type: "answer_result", teamId: team.id, correct, correctIndex: turn.question.correctIndex, correctOption, position: team.position });
        if (turn.timer)
            clearTimeout(turn.timer);
        turn = undefined;
        sync();
        return setTimeout(() => advanceTurn(team, correct ? "resposta correta" : "resposta incorreta", 0), 1400);
    }
    send(socket, { type: "error", message: "Tipo de mensagem desconhecido." });
}
// Cada conexao recebe um snapshot inicial e depois atualizacoes em tempo real.
const server = net.createServer(socket => {
    peers.add(socket);
    socket.setEncoding("utf8");
    send(socket, snapshot());
    let buffer = "";
    socket.on("data", (chunk) => { buffer += chunk; let i; while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line)
            continue;
        try {
            const msg = JSON.parse(line);
            const team = teams.find(t => t.id === socket.teamId);
            log("TCP", "IN", String(socket.remoteAddress), "server", msg.type);
            handle(team, msg, socket);
        }
        catch {
            send(socket, { type: "error", message: "JSON malformado." });
            log("TCP", "IN", String(socket.remoteAddress), "server", "malformed");
        }
    } });
    socket.on("close", () => {
        peers.delete(socket);
        const taggedSocket = socket;
        const index = teams.findIndex(t => t.id === taggedSocket.teamId);
        if (index < 0)
            return;
        const team = teams[index];
        taggedSocket.teamId = undefined;
        history.unshift(`${team.name} desconectou.`);
        log("TCP", "LOCAL", "server", "game", "disconnect", team.name);
        if (!gameStarted) {
            teams.splice(index, 1);
            return sync();
        }
        team.connected = false;
        if (drawPhase === "select") {
            const cardId = drawSelections.get(team.id);
            drawSelections.delete(team.id);
            if (cardId !== undefined)
                drawCardOwners.delete(cardId);
            if (!drawParticipants().length)
                return finishGame();
            if (allDrawsSelected())
                return resolveDraw();
            return sync();
        }
        if (turn?.teamId === team.id)
            return endTurn("desconectou");
        sync();
    });
    socket.on("error", () => undefined);
});
server.on("error", error => { console.error(`Servidor nao pode abrir a porta TCP ${settings.tcpPort}: ${error.message}`); log("TCP", "ERROR", `server:${settings.tcpPort}`, "server", "socket_error", error.message); process.exit(1); });
server.listen(settings.tcpPort, () => { console.log(`Trilha Redes server TCP ${settings.tcpPort}; UDP ${settings.udpPort}`); log("TCP", "LOCAL", "server", "server", "listening", String(settings.tcpPort)); });
