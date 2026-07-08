import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { RoomHub, type Peer } from "./rooms";

// http 서버에 ws를 얹는다.
//  - GET 요청은 200("signaling ok") — Railway 헬스체크 + 상태 확인용
//  - ws 연결은 방 참가/시그널링 중계에 사용
export function createSignalingServer(): http.Server {
  const hub = new RoomHub();

  const server = http.createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("signaling ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });
  let nextId = 1;

  wss.on("connection", (socket) => {
    const peer: Peer = {
      id: String(nextId++),
      send: (msg) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      },
    };

    socket.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // 잘못된 JSON은 무시
      }
      if (!msg || typeof msg !== "object") return;
      const m = msg as Record<string, unknown>;

      if (m.t === "join" && typeof m.room === "string") {
        const result = hub.join(m.room, peer);
        if (!result.ok) {
          peer.send({ t: "error", reason: result.reason });
          socket.close();
        }
        return;
      }

      if (m.t === "signal") {
        hub.signal(peer, m.payload);
        return;
      }
    });

    socket.on("close", () => hub.leave(peer));
    socket.on("error", () => hub.leave(peer));
  });

  return server;
}
