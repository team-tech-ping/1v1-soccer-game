import type { Peer } from "./rooms";

// 랜덤(빠른) 매칭 큐. 단일 권위 서버라 경쟁 상태 없이 FIFO로 짝을 맺는다.
// 경기 방식(mode)별로 큐를 나눠 '같은 방식'끼리만 매칭한다(시간제↔시간제, 점수제↔점수제).
// 대기자가 있으면 즉시 매칭: 방 코드를 발급하고 양쪽에 { matched, code, role }을 보낸다.
// 먼저 기다린 쪽이 host(게임 권위), 나중에 온 쪽이 guest. (둘 다 같은 방식을 골랐으므로
// host의 방식이 곧 합의된 방식 — 방식 값 자체는 matchStart 단계에서 전달된다.)

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
  // 방식별 대기자 슬롯. 알 수 없는 방식 문자열도 그 키로 분리 대기(안전).
  private waiting = new Map<string, Peer>();

  // 테스트에서 코드 생성기를 주입할 수 있다(결정성 확보).
  constructor(private readonly gen: () => string = defaultCode) {}

  // 큐 진입. 같은 방식의 대기자가 있으면 즉시 매칭.
  enqueue(peer: Peer, mode = "time"): void {
    if (this.waiting.get(mode) === peer) return; // 같은 방식 중복 진입 무시
    this.remove(peer); // 다른 방식 큐에 남아있던 것 정리(중복 대기 방지)

    const waiter = this.waiting.get(mode);
    if (waiter) {
      this.waiting.delete(mode);
      const code = this.gen();
      waiter.send({ t: "matched", code, role: "host" });
      peer.send({ t: "matched", code, role: "guest" });
      return;
    }
    this.waiting.set(mode, peer);
  }

  // 취소 또는 연결 종료 시 모든 방식 큐에서 제거.
  remove(peer: Peer): void {
    for (const [mode, w] of this.waiting) {
      if (w === peer) this.waiting.delete(mode);
    }
  }

  get waitingCount(): number {
    return this.waiting.size;
  }
}
