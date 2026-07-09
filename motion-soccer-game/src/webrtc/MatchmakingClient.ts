// 랜덤(빠른) 매칭 클라이언트. Railway 서버의 매칭 큐에 진입한다.
// 매칭되면 서버가 발급한 방 코드/역할을 받아, 이후 기존 입장 플로우를 그대로 탄다.

export type MatchRole = "host" | "guest";

export interface MatchResult {
  code: string;
  role: MatchRole;
}

export class MatchmakingClient {
  private ws: WebSocket | null = null;

  constructor(private readonly url: string) {}

  // 큐 진입. 연결되면 resolve(대기 시작), 매칭되면 onMatched 호출.
  start(onMatched: (result: MatchResult) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "queue" }));
        resolve();
      };
      ws.onerror = () => reject(new Error("매칭 서버 연결 실패"));
      ws.onmessage = (ev) => {
        let msg: { t?: string; code?: string; role?: MatchRole };
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.t === "matched" && msg.code && (msg.role === "host" || msg.role === "guest")) {
          onMatched({ code: msg.code, role: msg.role });
        }
      };
    });
  }

  // 취소 또는 매칭 완료 후 정리. 서버에 cancel을 보내고 소켓을 닫는다.
  cancel(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "cancel" }));
    }
    this.ws?.close();
    this.ws = null;
  }
}
