// Railway 시그널링 서버와의 WebSocket 연결.
// WebRTC 핸드셰이크(offer/answer/ICE)만 오가며, 영상은 여기를 지나지 않는다.
// 서버 프로토콜은 server/src/rooms.ts 참조.

export type SignalPayload = unknown;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private onSignalCb: ((payload: SignalPayload) => void) | null = null;
  private onPeerJoinedCb: (() => void) | null = null;
  private onPeerLeftCb: (() => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly room: string
  ) {}

  onSignal(cb: (payload: SignalPayload) => void): void {
    this.onSignalCb = cb;
  }
  onPeerJoined(cb: () => void): void {
    this.onPeerJoinedCb = cb;
  }
  onPeerLeft(cb: () => void): void {
    this.onPeerLeftCb = cb;
  }

  // 연결 후 방에 join하고, 서버의 joined 응답을 받으면 resolve.
  // resolve 값의 peerPresent: 입장 시점에 상대가 이미 방에 있는지(=count 2).
  // initiator가 '나중에 들어온' 경우엔 peer-joined 이벤트가 안 오므로 이 값으로 offer 타이밍을 잡는다.
  connect(): Promise<{ peerPresent: boolean }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => ws.send(JSON.stringify({ t: "join", room: this.room }));
      ws.onerror = () => reject(new Error("시그널링 서버 연결 실패"));
      ws.onmessage = (ev) => {
        let msg: { t?: string; payload?: unknown; reason?: string; count?: number };
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        switch (msg.t) {
          case "joined":
            resolve({ peerPresent: (msg.count ?? 1) >= 2 });
            break;
          case "peer-joined":
            this.onPeerJoinedCb?.();
            break;
          case "peer-left":
            this.onPeerLeftCb?.();
            break;
          case "signal":
            this.onSignalCb?.(msg.payload);
            break;
          case "error":
            reject(new Error(`시그널링 오류: ${msg.reason ?? "unknown"}`));
            break;
        }
      };
    });
  }

  signal(payload: SignalPayload): void {
    this.ws?.send(JSON.stringify({ t: "signal", payload }));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
