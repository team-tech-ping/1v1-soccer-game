import type { NetChannel } from "./NetChannel";
import { EV_MATCH, isMatchEvent } from "./protocol";
import type { MatchMode } from "../config";

export type Role = "host" | "guest";

// 방 세션: presence로 양쪽 입장을 감지하고, host가 matchStart를 보내면 양쪽 ready.
// role은 HomeScene이 결정한다(방 생성=host, 코드 입장=guest).
// 경기 방식(시간제/점수제)은 host가 고르고 matchStart에 실어 guest에게 전달한다.
export class RoomSession {
  private readyCb: (() => void) | null = null;
  private started = false;
  private matchMode: MatchMode;

  constructor(
    private ch: NetChannel,
    public readonly role: Role,
    hostMode: MatchMode = "time"
  ) {
    this.matchMode = hostMode; // host는 자신이 고른 값, guest는 matchStart 수신 시 덮어씀
  }

  get channel(): NetChannel {
    return this.ch;
  }

  // host가 고른(또는 guest가 수신한) 경기 방식. onReady 이후 유효.
  get mode(): MatchMode {
    return this.matchMode;
  }

  onReady(cb: () => void): void {
    this.readyCb = cb;
  }

  async start(): Promise<void> {
    // guest: host의 matchStart를 기다린다(경기 방식도 여기서 받는다).
    if (this.role === "guest") {
      this.ch.on(EV_MATCH, (payload) => {
        if (isMatchEvent(payload) && payload.kind === "matchStart") {
          if (payload.mode) this.matchMode = payload.mode;
          this.fireReady();
        }
      });
    }

    // host: 2명이 모이면 방식을 실은 matchStart를 보내고 자신도 ready.
    if (this.role === "host") {
      this.ch.onPresenceChange((count) => {
        if (count >= 2 && !this.started) {
          this.ch.send(EV_MATCH, { kind: "matchStart", mode: this.matchMode });
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
