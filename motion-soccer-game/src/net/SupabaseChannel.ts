import type { RealtimeChannel } from "@supabase/supabase-js";
import type { NetChannel } from "./NetChannel";
import { getSupabase } from "./supabaseClient";

// NetChannel의 Supabase Realtime Broadcast 구현.
// 방 = 채널 `room:{code}`. broadcast로 메시지, presence로 인원 수 추적.
export class SupabaseChannel implements NetChannel {
  private channel: RealtimeChannel;
  private presenceCb: ((count: number) => void) | null = null;
  private presenceBound = false;
  private clientId = Math.random().toString(36).slice(2);

  constructor(roomCode: string) {
    const supabase = getSupabase();
    this.channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.clientId },
      },
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
    // 최신 콜백이 이긴다(FakeChannel의 덮어쓰기 semantics와 일치).
    this.presenceCb = cb;
    // presence 바인딩은 한 번만 붙인다(중복 등록 시 sync당 콜백이 여러 번 발화되는 것 방지).
    if (this.presenceBound) return;
    this.presenceBound = true;
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState();
      this.presenceCb?.(Object.keys(state).length);
    });
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
