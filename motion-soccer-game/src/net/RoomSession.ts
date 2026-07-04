import type { NetChannel } from "./NetChannel";
import { EV_MATCH, isMatchEvent } from "./protocol";

export type Role = "host" | "guest";

// 방 세션: presence로 양쪽 입장을 감지하고, host가 matchStart를 보내면 양쪽 ready.
// role은 HomeScene이 결정한다(방 생성=host, 코드 입장=guest).
export class RoomSession {
  private readyCb: (() => void) | null = null;
  private started = false;

  constructor(private ch: NetChannel, public readonly role: Role) {}

  get channel(): NetChannel {
    return this.ch;
  }

  onReady(cb: () => void): void {
    this.readyCb = cb;
  }

  async start(): Promise<void> {
    // guest: host의 matchStart를 기다린다.
    if (this.role === "guest") {
      this.ch.on(EV_MATCH, (payload) => {
        if (isMatchEvent(payload) && payload.kind === "matchStart") {
          this.fireReady();
        }
      });
    }

    // host: 2명이 모이면 matchStart를 보내고 자신도 ready.
    if (this.role === "host") {
      this.ch.onPresenceChange((count) => {
        if (count >= 2 && !this.started) {
          this.ch.send(EV_MATCH, { kind: "matchStart" });
          this.fireReady();
        }
      });
    }

    await this.ch.join();
  }

  private fireReady(): void {
    if (this.started) return;
    this.started = true;
    this.readyCb?.();
  }
}
