import net from "node:net";
import dgram from "node:dgram";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Msg = { type: string; [key: string]: unknown };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const configPath = path.join(root, "config.json");
const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const TCP_PORT = 4000, UDP_PORT = 4001, BRIDGE_PORT = 5175;
let HOST = String(cfg.serverHost || "127.0.0.1");
const logsDir = path.join(root, "logs"); fs.mkdirSync(logsDir, { recursive: true });
const log = (protocol: string, direction: string, origin: string, destination: string, type: string) => fs.appendFileSync(path.join(logsDir, `client-${new Date().toISOString().slice(0,10)}.log`), `${new Date().toISOString()} | ${protocol} | ${direction} | ${origin} -> ${destination} | ${type}\n`);
let socket: net.Socket | undefined, buffer = "", state: Msg = { type: "state", gameStarted: false, teams: [], history: [] }, ownTeamId: string | undefined;
const listeners = new Set<http.ServerResponse>();
const connectionConfig = () => ({ serverHost: HOST, tcpPort: TCP_PORT, udpPort: UDP_PORT, localBridgePort: BRIDGE_PORT });
function saveConnectionConfig(serverHost: string) { HOST = serverHost; const saved = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {}; fs.writeFileSync(configPath, JSON.stringify({ ...saved, serverHost: HOST }, null, 2) + "\n"); if (socket && !socket.destroyed) socket.destroy(); socket = undefined; buffer = ""; event({ type: "connection_config", config: connectionConfig() }); }
function event(message: Msg) { if (message.type === "lobby_reset") { ownTeamId = undefined; state = { type: "state", gameStarted: false, gameEnded: false, teams: [], history: [] }; } else { state = message.type === "state" ? message : state; if (message.type === "registered") ownTeamId = (message.team as {id:string}).id; } const encoded = `data: ${JSON.stringify({ ...message, ownTeamId, state })}\n\n`; listeners.forEach(r => r.write(encoded)); }
function send(msg: Msg) { if (!socket || socket.destroyed) throw new Error("Cliente TCP não conectado ao servidor."); socket.write(JSON.stringify(msg) + "\n"); log("TCP", "OUT", `client:${BRIDGE_PORT}`, `${HOST}:${TCP_PORT}`, msg.type); }
const udp = dgram.createSocket("udp4");
udp.on("message", raw => { try { const msg = JSON.parse(raw.toString("utf8")) as Msg; log("UDP", "IN", `${HOST}:${UDP_PORT}`, "client", msg.type); event({ type: "udp_notice", notice: msg }); } catch { /* ignore malformed datagram */ } });
udp.bind(0, "0.0.0.0", () => console.log(`UDP local ${((udp.address() as { port: number }).port)}`));
connect();
function connect() { if (socket && !socket.destroyed) return; socket = net.createConnection({ host: HOST, port: TCP_PORT }); socket.setEncoding("utf8"); socket.on("connect", () => event({ type: "connection", connected: true })); socket.on("data", (chunk: string) => { buffer += chunk; let n; while ((n = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0,n).trim(); buffer = buffer.slice(n+1); if (!line) continue; try { const msg = JSON.parse(line) as Msg; log("TCP", "IN", `${HOST}:${TCP_PORT}`, "client", msg.type); event(msg); } catch { event({ type:"error", message:"Mensagem TCP inválida recebida." }); } } }); socket.on("close", () => event({ type:"connection", connected:false })); socket.on("error", err => event({ type:"error", message:err.message })); }
const webRoot = path.join(root, "web", "dist");
const contentTypes: Record<string, string> = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".glb":"model/gltf-binary", ".ico":"image/x-icon" };
function serveWeb(pathname: string, res: http.ServerResponse) { const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""); const file = path.resolve(webRoot, relative); if (!file.startsWith(`${webRoot}${path.sep}`)) return res.writeHead(403).end(); fs.readFile(file, (error, data) => { if (error) return res.writeHead(404).end("Interface web nao compilada. Execute npm run build."); res.writeHead(200, { "Content-Type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" }).end(data); }); }
const bridge = http.createServer((req, res) => {
 const url = new URL(req.url || "/", `http://localhost:${BRIDGE_PORT}`);
 res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 if (req.method === "OPTIONS") return res.writeHead(204).end();
 if (url.pathname === "/events") { res.writeHead(200, { "Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive" }); res.write(`data: ${JSON.stringify({ type:"initial", ownTeamId, state })}\n\n`); listeners.add(res); req.on("close", () => listeners.delete(res)); return; }
 if (url.pathname === "/state") return res.writeHead(200, {"Content-Type":"application/json"}).end(JSON.stringify({ ...state, ownTeamId }));
 if (url.pathname === "/config") { if (req.method === "GET") return res.writeHead(200, {"Content-Type":"application/json"}).end(JSON.stringify(connectionConfig())); if (req.method === "POST") { let body=""; req.on("data", c => body += c); req.on("end", () => { try { if (state.gameStarted) return res.writeHead(409).end(JSON.stringify({ok:false,error:"A conexão não pode ser alterada durante uma partida."})); const next = JSON.parse(body) as { serverHost?:unknown }; const serverHost = String(next.serverHost || "").trim(); if (!serverHost) return res.writeHead(400).end(JSON.stringify({ok:false,error:"Informe um IP ou hostname válido."})); saveConnectionConfig(serverHost); res.writeHead(200).end(JSON.stringify({ok:true,config:connectionConfig()})); } catch (e) { res.writeHead(400).end(JSON.stringify({ok:false,error:(e as Error).message})); } }); return; } }
 if (url.pathname === "/action" && req.method === "POST") { let body=""; req.on("data", c => body += c); req.on("end", () => { try { const action = JSON.parse(body) as Msg; if (action.type === "register") { connect(); const udpPort = (udp.address() as { port: number }).port; setTimeout(() => { try { send({ ...action, udpPort }); res.writeHead(202).end(JSON.stringify({ok:true})); } catch (e) { res.writeHead(503).end(JSON.stringify({ok:false,error:(e as Error).message})); } }, 120); } else { send(action); res.writeHead(202).end(JSON.stringify({ok:true})); } } catch (e) { res.writeHead(400).end(JSON.stringify({ok:false,error:(e as Error).message})); } }); return; }
 return serveWeb(url.pathname, res);
});
bridge.on("error", error => { console.error(`Cliente nao pode abrir a porta HTTP ${BRIDGE_PORT}: ${error.message}`); log("HTTP", "ERROR", `client:${BRIDGE_PORT}`, "client", "socket_error"); process.exit(1); });
bridge.listen(BRIDGE_PORT, () => console.log(`Interface local: http://127.0.0.1:${BRIDGE_PORT} → ${HOST}:${TCP_PORT}`));
