import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type PawnSkin = "cyan" | "magenta" | "gold";
type Team = { id:string; name:string; participants:string[]; emoji:string; pawnSkin:PawnSkin; position:number; tokens:number[]; startConfirmed:boolean; connected:boolean };
type Cell = { position:number; category:"H"|"S"|"R"; color:string };
type DrawCard = { id:number; selected:boolean; teamId?:string; value?:number };
type DrawSelection = { teamId:string; cardId:number; value?:number };
type DrawState = { phase:"select"|"reveal"; cards:DrawCard[]; selections:DrawSelection[]; order?:string[] };
type GameState = { gameStarted?:boolean; gameEnded?:boolean; startVoteActive?:boolean; board?:Cell[]; teams?:Team[]; currentTeamId?:string; phase?:"ready"|"category"|"token"|"answer"; deadlineAt?:number; currentCategory?:string; question?:{statement:string;options:string[]}; draw?:DrawState; history?:string[] };
type AnswerFeedback = { correct:boolean; correctOption?:string; teamName?:string };
type ConnectionConfig = { serverHost:string; tcpPort:number; udpPort:number; localBridgePort:number };
const bridge = "http://127.0.0.1:5175";
const labels = { H:"Hardware", S:"Software", R:"Redes" };

function pinPosition(position:number) {
  if (position <= 10) return { left: 7 + position * 8.6, top: 78 };
  if (position <= 20) return { left: 93 - (position - 11) * (86 / 9), top: 48 };
  return { left: 7 + (position - 21) * (86 / 9), top: 18 };
}

function MapPawns({ teams, lastPosition }:{ teams:Team[]; lastPosition:number }) {
  return <div className="map-pawns" aria-label="Peões das equipes no tabuleiro">{teams.map(team => {
    const point = pinPosition(Math.min(team.position, lastPosition));
    const peers = teams.filter(other => other.position === team.position);
    const slot = peers.findIndex(other => other.id === team.id) - (peers.length - 1) / 2;
    const spread = peers.length > 1 ? 26 : 0;
    return <img className="map-pawn" key={team.id} src={`/assets/pawns/pawn-${team.pawnSkin}-preview.png`} alt={`Peão da equipe ${team.name}`} style={{ left:`calc(${point.left}% + ${slot * spread}px)`, top:`${point.top}%` }}/>;
  })}</div>;
}

function PawnPreview({ skin }:{ skin:PawnSkin }) {
  return <img className="pawn-preview" src={`/assets/pawns/pawn-${skin}-preview.png`} alt={`Peão 3D ${skin}`}/>;
}

function Confetti() { return <div className="celebration-burst" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>; }

function FinalGameCard({ didWin, tied, winners, onReturn }:{ didWin:boolean; tied:boolean; winners:string; onReturn:() => void }) {
  return <div className={`waiting game-over-card ${didWin ? "winner" : "spectator"}`}>{didWin && <Confetti/>}<div className="question-label">{didWin ? (tied ? "EMPATE CONFIRMADO" : "VITÓRIA CONFIRMADA") : "PARTIDA ENCERRADA"}</div><h2>{didWin ? (tied ? "Sua equipe empatou no primeiro lugar!" : "Sua equipe venceu a trilha!") : tied ? `${winners} empataram na liderança.` : `${winners} venceu a partida.`}</h2><p>{didWin ? "Parabéns, a rota foi concluída com sucesso." : "O resultado final foi sincronizado para todas as equipes."}</p><button className="return-lobby-final" onClick={onReturn}>Voltar ao lobby</button></div>;
}

function DrawOverlay({ draw, teams, ownTeamId, onPick }:{ draw:DrawState; teams:Team[]; ownTeamId?:string; onPick:(cardId:number) => void }) {
  const revealing = draw.phase === "reveal";
  const ownPick = draw.selections.find(selection => selection.teamId === ownTeamId);
  const teamName = (teamId?:string) => teams.find(team => team.id === teamId)?.name || "Equipe";
  const orderedTeams = draw.order?.map(teamId => teams.find(team => team.id === teamId)).filter(Boolean) as Team[] | undefined;
  return <div className="draw-overlay" role="dialog" aria-modal="true" aria-label="Sorteio da ordem de jogo"><section className="draw-card panel">
    <div className="draw-kicker">{revealing ? "RESULTADO DO SORTEIO" : "SORTEIO DA ORDEM"}</div>
    <h2>{revealing ? "A ordem de jogo está definida." : "Escolha uma ficha virada para baixo."}</h2>
    <p className="draw-intro">{revealing ? "As fichas foram reveladas do maior para o menor valor. Empates seguem a ordem de cadastro." : "Cada equipe escolhe uma ficha. O valor só aparece quando todas as escolhas forem feitas."}</p>
    <div className="draw-chip-grid" aria-label="Fichas do sorteio">
      {draw.cards.map(card => {
        const mine = ownPick?.cardId === card.id;
        return <button type="button" key={card.id} className={`poker-chip draw-chip ${card.selected ? "selected" : ""} ${mine ? "mine" : ""} ${revealing ? "revealed" : ""}`} disabled={revealing || card.selected || Boolean(ownPick)} onClick={() => onPick(card.id)} aria-label={revealing ? `Ficha revelada com valor ${card.value ?? "não sorteado"}` : card.selected ? "Ficha já escolhida" : "Escolher esta ficha"}>
          <span className="chip-ring"/><span className="chip-mark">TRILHA</span>{revealing ? <strong>{card.value ?? "—"}</strong> : <strong>?</strong>}<small>{revealing ? (card.teamId ? teamName(card.teamId) : "LIVRE") : card.selected ? "RESERVADA" : "ESCOLHER"}</small>
        </button>;
      })}
    </div>
    <div className="draw-team-status">{teams.map(team => { const pick = draw.selections.find(selection => selection.teamId === team.id); return <div key={team.id} className={pick ? "picked" : "waiting"}><span>{team.emoji}</span><strong>{team.name}</strong><em>{revealing && pick ? `FICHA ${pick.value}` : pick ? "ESCOLHIDA" : "AGUARDANDO"}</em></div>; })}</div>
    {revealing && orderedTeams && <div className="draw-order"><small>ORDEM DA PARTIDA</small>{orderedTeams.map((team, index) => <span key={team.id}><b>{index + 1}</b>{team.name}<em>{draw.selections.find(selection => selection.teamId === team.id)?.value}</em></span>)}</div>}
    {!revealing && <p className="draw-status-note">{ownPick ? "Sua escolha está reservada. Aguarde as outras equipes." : "Sua equipe ainda precisa escolher uma ficha."}</p>}
  </section></div>;
}

const instructionSteps = [
  ["Monte a equipe", "Informe equipe e participantes. Cada um dos três peões 3D só pode ser escolhido por uma equipe."],
  ["Confirme o início", "O botão Play abre uma confirmação coletiva. A partida só começa quando todas as equipes votarem sim."],
  ["Inicie seu turno", "Quando sua equipe estiver pronta, use Iniciar turno. O cronômetro só passa a contar depois disso."],
  ["Defina o assunto", "No primeiro turno, escolha Hardware, Software ou Redes. Depois, a casa atual determina a categoria."],
  ["Escolha a ficha", "Escolha de 1 a 5 em até 40 segundos. Sem escolha, o servidor aplica a maior ficha disponível."],
  ["Responda a pergunta", "Você tem 80 segundos. Acertou: avança o valor da ficha. Sem resposta: perde a vez e a ficha."],
  ["Chegue ao fim", "Alcance a casa Fim para vencer. No resultado, todas as equipes podem voltar ao lobby e jogar de novo."]
];

function InstructionsOverlay({ onClose }:{ onClose:() => void }) {
  return <div className="instructions-overlay" role="dialog" aria-modal="true" aria-label="Instruções do jogo"><section className="instructions-panel panel"><button className="instructions-close" type="button" aria-label="Fechar instruções" onClick={onClose}>×</button><div className="instructions-title"><div className="question-label">GUIA DA PARTIDA</div><h2>Como jogar Trilha Redes</h2><p>Do lobby até a vitória, siga o fluxo abaixo.</p></div><div className="instructions-grid">{instructionSteps.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2,"0")}</span><h3>{title}</h3><p>{description}</p></article>)}</div><button className="instructions-done" type="button" onClick={onClose}>Entendi, voltar ao lobby</button></section></div>;
}

export default function App() {
  const [state, setState] = useState<GameState>({ teams:[], board:[], history:[] });
  const [ownTeamId, setOwnTeamId] = useState<string>();
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback>();
  const [dismissedReadyTeamId, setDismissedReadyTeamId] = useState<string>();
  const feedbackTimer = useRef<number | undefined>(undefined);
  const [connection, setConnection] = useState<ConnectionConfig>({ serverHost:"127.0.0.1", tcpPort:4000, udpPort:4001, localBridgePort:5175 });
  const [showConnection, setShowConnection] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [form, setForm] = useState<{name:string;participants:string;pawnSkin:PawnSkin}>({ name:"", participants:"", pawnSkin:"cyan" });
  const own = state.teams?.find(t => t.id === ownTeamId);
  const current = state.teams?.find(t => t.id === state.currentTeamId);
  const isMyTurn = Boolean(ownTeamId && ownTeamId === state.currentTeamId);
  const availableTokens = own?.tokens || [1,2,3,4,5];
  const currentTopic = state.currentCategory && state.currentCategory in labels ? labels[state.currentCategory as keyof typeof labels] : "Aguardando assunto";
  const ranking = useMemo(() => [...(state.teams || [])].sort((a,b) => b.position - a.position), [state.teams]);
  const finalWinners = state.gameEnded && ranking.length ? ranking.filter(team => team.position === ranking[0].position) : [];
  const didWin = Boolean(own && finalWinners.some(team => team.id === own.id));
  const winnerNames = finalWinners.map(team => team.name).join(" e ");
  const takenPawnSkins = useMemo(() => new Set<PawnSkin>((state.teams || []).map(team => team.pawnSkin)), [state.teams]);
  const noPawnAvailable = takenPawnSkins.size >= 3;

  useEffect(() => {
    fetch(`${bridge}/state`).then(r => r.json()).then(x => { setState(x); setOwnTeamId(x.ownTeamId); }).catch(() => setError("Inicie o processo cliente local na porta 5175."));
    fetch(`${bridge}/config`).then(r => r.json()).then(setConnection).catch(() => undefined);
    const stream = new EventSource(`${bridge}/events`);
    stream.onmessage = e => { const x = JSON.parse(e.data); if (x.state) setState(x.state); if (x.type === "lobby_reset") setOwnTeamId(undefined); else if ("ownTeamId" in x) setOwnTeamId(typeof x.ownTeamId === "string" ? x.ownTeamId : undefined); if (x.type === "error") setError(String(x.message)); if (x.type === "answer_result") { const answeringTeam = x.state?.teams?.find((team:Team) => team.id === x.teamId); setFeedback({ correct:Boolean(x.correct), correctOption:typeof x.correctOption === "string" ? x.correctOption : undefined, teamName:answeringTeam?.name }); if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current); feedbackTimer.current = window.setTimeout(() => setFeedback(undefined), 1350); } };
    return () => { stream.close(); if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current); };
  }, []);
  useEffect(() => {
    if (ownTeamId || !takenPawnSkins.has(form.pawnSkin)) return;
    const available = (["cyan","magenta","gold"] as PawnSkin[]).find(skin => !takenPawnSkins.has(skin));
    if (available) setForm(current => ({ ...current, pawnSkin: available }));
  }, [form.pawnSkin, ownTeamId, takenPawnSkins]);
  useEffect(() => {
    if (!state.deadlineAt) { setSeconds(0); return; }
    const refresh = () => setSeconds(Math.max(0, Math.ceil((state.deadlineAt! - Date.now()) / 1000)));
    refresh(); const clock = setInterval(refresh, 500); return () => clearInterval(clock);
  }, [state.deadlineAt]);
  useEffect(() => { if (state.phase !== "ready") setDismissedReadyTeamId(undefined); }, [state.phase]);
  const action = async (payload:object) => {
    setError("");
    const response = await fetch(`${bridge}/action`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const result = await response.json();
    if (!result.ok) setError(result.error || "Não foi possível enviar a ação.");
  };
  const saveConnection = async () => { setError(""); const response = await fetch(`${bridge}/config`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(connection) }); const result = await response.json(); if (!result.ok) return setError(result.error || "Não foi possível salvar a conexão."); setConnection(result.config); setShowConnection(false); };
  const register = (e:FormEvent) => { e.preventDefault(); action({ type:"register", name:form.name, participants:form.participants.split(",").map(x => x.trim()).filter(Boolean), pawnSkin:form.pawnSkin }); };

  if (!ownTeamId) return <><main className="login"><section className="login-art"><span className="signal">◈</span><p>PROTOCOLO // EDUCACIONAL</p><h1>TRILHA<br/><i>REDES</i></h1><div className="legend"><b>H</b> Hardware <b>S</b> Software <b>R</b> Redes</div></section><form className="login-form" onSubmit={register}><div className="lobby-form-head"><h2>Monte sua equipe</h2><button className="instructions-button" type="button" onClick={() => setShowInstructions(true)}>Instruções</button></div><div className="connection-settings"><div><small>SERVIDOR</small><strong>{connection.serverHost}:4000</strong></div><button type="button" onClick={() => setShowConnection(!showConnection)}>{showConnection ? "Fechar" : "Configurar"}</button></div>{showConnection && <div className="connection-form"><label>IP ou hostname do servidor<input value={connection.serverHost} onChange={e => setConnection({...connection,serverHost:e.target.value})} placeholder="192.168.1.50"/></label><p>Portas fixas: TCP 4000 · UDP 4001</p><button type="button" onClick={saveConnection}>Salvar conexão</button></div>}<div className="pawn-choice"><div className="pawn-choice-head"><small>PASSO 1 · PEÃO 3D</small><strong>Escolha seu avatar</strong></div><div>{(["cyan","magenta","gold"] as PawnSkin[]).map(skin => { const taken = takenPawnSkins.has(skin); return <button type="button" disabled={taken} aria-label={taken ? `Peão ${skin} ocupado` : `Selecionar peão ${skin}`} title={taken ? "Este peão já foi escolhido" : "Selecionar peão"} className={`pawn-option ${skin} ${taken ? "unavailable" : ""} ${form.pawnSkin === skin ? "selected" : ""}`} onClick={() => setForm({...form,pawnSkin:skin})} key={skin}><PawnPreview skin={skin}/>{taken && <span className="pawn-unavailable">OCUPADO</span>}</button>; })}</div></div><p>{noPawnAvailable ? "As três vagas e peões já foram ocupados." : "PASSO 2 · Informe os dados da equipe para abrir o canal TCP/UDP."}</p><label>Nome da equipe<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex.: Packet Pioneers"/></label><label>Participantes <small>separados por vírgula</small><input required value={form.participants} onChange={e => setForm({...form,participants:e.target.value})} placeholder="Ana, Bruno, Carla"/></label>{error && <div className="error">{error}</div>}<button disabled={noPawnAvailable}>Entrar no mapa <span>→</span></button></form></main>{showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)}/>}</>;

  return <main className="game">
    <header className="game-header"><div className="brand"><span>◈</span> TRILHA <em>REDES</em><small>CANAL ATIVO</small></div><div className="turn-command">{state.gameEnded ? <><small>PARTIDA</small><strong>FINALIZADA</strong></> : !state.gameStarted ? <button className="play-button" aria-label="Iniciar partida" title="Iniciar partida" disabled={(state.teams?.length || 0) < 1} onClick={() => action({type:"start_game"})}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button> : <><small>VEZ ATUAL</small><strong>{current ? `${current.emoji} ${current.name}` : "Aguardando equipes"}</strong><em><span>{state.phase === "ready" ? "PRONTO" : state.phase === "token" ? "FICHA" : state.phase === "category" ? "ASSUNTO" : "RESPOSTA"}</span>{state.phase === "ready" ? "—" : `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`}</em></>}</div><div className="top-score"><small>PLACAR</small><div>{ranking.slice(0,3).map((team,index) => <span className={team.id === state.currentTeamId ? "leading" : ""} key={team.id}><b>{index + 1}</b>{team.name}<em>{team.position}</em></span>)}</div></div></header>
    <section className="layout">
      <div className="map-panel panel"><div className="panel-head"><div><small>MINIMAPA DE PROGRESSÃO</small><h2>Rota de pacotes</h2></div><span>POSIÇÃO {String(own?.position || 0).padStart(2,"0")}/30</span></div>
        <div className="mini-map"><div className="map-noise"/><svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="7,78 93,78 93,48 7,48 7,18 93,18"/><polyline className="route-faint" points="7,83 96,83 96,43 4,43 4,13 93,13"/></svg><span className="map-label start">INÍCIO</span><span className="map-label finish">FIM</span>{state.board?.map(cell => { const point = pinPosition(cell.position); const isStart = cell.position === 0; const isFinish = cell.position === (state.board?.length || 1) - 1; const categoryName = labels[cell.category]; return <div key={cell.position} className={`map-pin cat-${cell.category} ${isStart ? "start-cell" : ""} ${isFinish ? "finish-cell" : ""} ${cell.position === current?.position ? "active" : ""}`} style={{left:`${point.left}%`,top:`${point.top}%`}} title={isStart ? "Casa inicial" : isFinish ? "Casa final" : `Casa ${cell.position}: ${categoryName}`}><span className="pin-number">{isStart ? "Início" : isFinish ? "Fim" : cell.position}</span>{!isStart && !isFinish && <span className="pin-category">{categoryName}</span>}</div>; })}<MapPawns teams={state.teams || []} lastPosition={(state.board?.length || 1) - 1}/></div>
        <div className="map-footer"><div><span className="dot h"/> H · Hardware</div><div><span className="dot s"/> S · Software</div><div><span className="dot r"/> R · Redes</div><p>O traço luminoso indica a rota oficial do servidor.</p></div>
      </div>
    </section>
    {state.gameStarted && state.draw && <DrawOverlay draw={state.draw} teams={state.teams || []} ownTeamId={ownTeamId} onPick={cardId => action({ type:"choose_draw_card", cardId })}/>}
    {state.gameStarted && !state.draw && state.phase === "ready" && isMyTurn && dismissedReadyTeamId === state.currentTeamId && <button className="resume-turn-button" onClick={() => setDismissedReadyTeamId(undefined)}>Abrir seu turno</button>}
    {state.startVoteActive && !state.gameStarted && <div className="start-vote-overlay" role="dialog" aria-modal="true" aria-label="Confirmação de início"><section className="start-vote-card panel"><div className="question-label">CONFIRMAÇÃO DE INÍCIO</div><h2>Todas as equipes estão de acordo?</h2><p>A partida inicia assim que cada equipe confirmar.</p><div className="vote-team-list">{state.teams?.map(team => <div className={team.startConfirmed ? "confirmed" : "pending"} key={team.id}><span>{team.emoji}</span><strong>{team.name}</strong><em>{team.startConfirmed ? "CONFIRMADO" : "AGUARDANDO"}</em></div>)}</div><button className="vote-start-button" disabled={Boolean(own?.startConfirmed)} onClick={() => action({type:"vote_start"})}>{own?.startConfirmed ? "Aguardando outras equipes" : "Sim, iniciar partida"}</button></section></div>}
    {state.gameStarted && (state.phase || state.gameEnded) && (state.gameEnded || state.phase !== "ready" || dismissedReadyTeamId !== state.currentTeamId) && <div className="turn-overlay" role="dialog" aria-modal="true" aria-label="Ação do turno"><section className="turn-card panel">{state.gameEnded ? <FinalGameCard didWin={didWin} tied={finalWinners.length > 1} winners={winnerNames} onReturn={() => action({type:"return_lobby"})}/> : state.phase === "ready" ? <div className="ready-turn"><button className="close-turn-popup" type="button" aria-label="Fechar aviso de início do turno" title="Fechar" onClick={() => setDismissedReadyTeamId(state.currentTeamId)}>×</button><div className="question-label">PRÓXIMA EQUIPE</div><h2>{current ? `${current.name}, prepare-se para jogar.` : "Preparando próximo turno."}</h2><p>O cronômetro só começa após iniciar o turno.</p><button className="start-turn-button" disabled={!isMyTurn} onClick={() => action({type:"start_turn"})}>Iniciar turno <span>→</span></button></div> : <><div className="turn-card-head"><div><div className="question-label">{state.phase === "category" ? "ESCOLHA DO ASSUNTO INICIAL" : `ASSUNTO // ${currentTopic}`}</div><span>{state.phase === "category" ? "01 · ASSUNTO" : state.phase === "token" ? "02 · FICHA" : "03 · RESPOSTA"}</span></div><strong>{String(Math.floor(seconds / 60)).padStart(2,"0")}:{String(seconds % 60).padStart(2,"0")}</strong></div><h2>{state.phase === "category" ? "Escolha o assunto da sua pergunta." : state.question?.statement || "Sincronizando pergunta…"}</h2>{state.phase === "category" ? <div className="topic-select"><p>{isMyTurn ? "Escolha o assunto inicial; depois, a casa atual define as próximas categorias." : "A equipe ativa está escolhendo o assunto inicial."}</p><div>{(["H","S","R"] as const).map(category => <button className={`topic ${category}`} disabled={!isMyTurn} onClick={() => action({type:"choose_category",category})} key={category}><b>{category}</b>{labels[category]}</button>)}</div></div> : state.phase === "token" ? <div className="token-select"><p>{isMyTurn ? "Defina o salto de rota. Se acertar, esta será a distância avançada." : "A equipe ativa está configurando a ficha."}</p><div>{[1,2,3,4,5].map(token => <button className={!availableTokens.includes(token) ? "spent" : ""} disabled={!isMyTurn || !availableTokens.includes(token)} onClick={() => action({type:"choose_token",token})} key={token}>{token}</button>)}</div></div> : <div className="answers">{state.question?.options.map((option,index) => <button disabled={!isMyTurn} key={option} onClick={() => action({type:"answer",answer:index})}><b>{"ABCD"[index]}</b>{option}</button>)}</div>}</>}</section></div>}{error && <div className="toast">{error}</div>}
    {feedback && <div className={`answer-feedback ${feedback.correct ? "success" : "failure"}`} role="status"><div className="feedback-card">{feedback.correct ? <><div className="celebration-burst"><i/><i/><i/><i/><i/><i/></div><strong>ACERTO CONFIRMADO</strong><h2>{feedback.teamName || "A equipe"} avançou na trilha!</h2><p>Resposta correta. O peão está seguindo para a próxima casa.</p></> : <><strong>RESPOSTA INCORRETA</strong><h2>Sem avanço nesta rodada.</h2><p>A resposta correta era: <b>{feedback.correctOption || "alternativa não disponível"}</b></p></>}</div></div>}
  </main>;
}
