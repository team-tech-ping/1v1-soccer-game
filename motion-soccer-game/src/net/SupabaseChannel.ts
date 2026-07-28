import type { RealtimeChannel } from "@supabase/supabase-js";
import type { NetChannel } from "./NetChannel";
import { getSupabase } from "./supabaseClient";

// NetChannel의 Supabase Realtime Broadcast 구현.
// 방 = 채널 `room:{code}`. broadcast로 메시지, presence로 인원 수 추적.
export class SupabaseChannel implements NetChannel {
  private channel: RealtimeChannel;
  private presenceCb: ((count: number) => void) | null = null;
  private clientId = Math.random().toString(36).slice(2);

  constructor(roomCode: string) {
    const supabase = getSupabase();
    this.channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.clientId },
      },
    });
    // presence 콜백은 반드시 subscribe() '이전에' 등록해야 한다 — 그 이후에 등록하면
    // Supabase가 "cannot add presence callbacks after subscribe()" 예외를 던진다.
    // (guest는 RoomSession이 onPresenceChange를 부르지 않아, 예전엔 PlayScene에서 처음
    //  호출되며 subscribe 뒤에 등록되어 예외로 create()가 중단·화면이 멈췄다.)
    // 그래서 리스너는 여기서 한 번만 바인딩하고, onPresenceChange는 콜백만 교체한다.
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState();
      this.presenceCb?.(Object.keys(state).length);
    });
  }

  send(event: string, payload: unknown): void {
    // broadcast는 payload를 { type, event, payload }로 감싼다.
    void this.channel.send({ type: "broadcast", event, payload });
  }

  on(event: string, cb: (payload: unknown) => void): void {
    this.channel.on("broadcast", { event }, (msg) => cb(msg.payload));
  }

  onPresenceChange(cb: (count: number) => void): void {
    // 리스너는 생성자에서 이미 바인딩됨(subscribe 전). 여기선 콜백만 교체한다.
    // 최신 콜백이 이긴다(FakeChannel의 덮어쓰기 semantics와 일치).
    this.presenceCb = cb;
  }

  async join(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void this.channel.track({ id: this.clientId });
          resolve();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          reject(new Error(`채널 연결 실패: ${status}`));
        }
      });
    });
  }

  async leave(): Promise<void> {
    await this.channel.unsubscribe();
  }
}

export function createSupabaseChannel(roomCode: string): SupabaseChannel {
  return new SupabaseChannel(roomCode);
}
