// 전송 계층 추상화. 게임/방 로직은 이 인터페이스만 알고 Supabase는 모른다.
// 프로덕션은 SupabaseChannel, 테스트는 FakeChannel을 주입한다.
export interface NetChannel {
  send(event: string, payload: unknown): void;
  on(event: string, cb: (payload: unknown) => void): void;
  onPresenceChange(cb: (count: number) => void): void;
  join(): Promise<void>;
  leave(): Promise<void>;
}

// 테스트용: 같은 hub에 붙은 채널들끼리 메시지를 즉시(동기) 주고받는다.
export class FakeHub {
  private channels = new Set<FakeChannel>();

  channel(id: string): FakeChannel {
    return new FakeChannel(this, id);
  }

  // 내부용 — FakeChannel이 호출
  _register(ch: FakeChannel): void {
    this.channels.add(ch);
    this._broadcastPresence();
  }
  _unregister(ch: FakeChannel): void {
    this.channels.delete(ch);
    this._broadcastPresence();
  }
  _deliver(from: FakeChannel, event: string, payload: unknown): void {
    for (const ch of this.channels) {
      if (ch !== from) ch._receive(event, payload);
    }
  }
  private _broadcastPresence(): void {
    const count = this.channels.size;
    for (const ch of this.channels) ch._presence(count);
  }
}

export class FakeChannel implements NetChannel {
  private handlers = new Map<string, ((payload: unknown) => void)[]>();
  private presenceCb: ((count: number) => void) | null = null;
  private joined = false;

  constructor(private hub: FakeHub, public readonly id: string) {}

  send(event: string, payload: unknown): void {
    this.hub._deliver(this, event, payload);
  }
  on(event: string, cb: (payload: unknown) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
  }
  onPresenceChange(cb: (count: number) => void): void {
    this.presenceCb = cb;
  }
  async join(): Promise<void> {
    if (this.joined) return;
    this.joined = true;
    this.hub._register(this);
  }
  async leave(): Promise<void> {
    if (!this.joined) return;
    this.joined = false;
    this.hub._unregister(this);
  }

  // hub 내부용
  _receive(event: string, payload: unknown): void {
    for (const cb of this.handlers.get(event) ?? []) cb(payload);
  }
  _presence(count: number): void {
    this.presenceCb?.(count);
  }
}
