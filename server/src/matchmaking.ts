import type { Peer } from "./rooms";

// 랜덤(빠른) 매칭 큐. 단일 권위 서버라 경쟁 상태 없이 FIFO로 짝을 맺는다.
// 대기자가 있으면 즉시 매칭: 방 코드를 발급하고 양쪽에 { matched, code, role }을 보낸다.
// 먼저 기다린 쪽이 host(게임 권위), 나중에 온 쪽이 guest.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자 제외
const CODE_LEN = 4;

function defaultCode(): string {
  let c = "";
  for (let i = 0; i < CODE_LEN; i++) {
    c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return c;
}

export class MatchQueue {
  private waiting: Peer | null = null;

  // 테스트에서 코드 생성기를 주입할 수 있다(결정성 확보).
  constructor(private readonly gen: () => string = defaultCode) {}

  // 큐 진입. 대기자가 있으면 즉시 매칭.
  enqueue(peer: Peer): void {
    if (this.waiting === peer) return; // 중복 진입 무시
    if (this.waiting) {
      const host = this.waiting;
      const guest = peer;
      this.waiting = null;
      const code = this.gen();
      host.send({ t: "matched", code, role: "host" });
      guest.send({ t: "matched", code, role: "guest" });
      return;
    }
    this.waiting = peer;
  }

  // 취소 또는 연결 종료 시 큐에서 제거.
  remove(peer: Peer): void {
    if (this.waiting === peer) this.waiting = null;
  }

  get waitingCount(): number {
    return this.waiting ? 1 : 0;
  }
}
