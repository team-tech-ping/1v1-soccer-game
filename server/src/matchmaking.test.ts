import { describe, it, expect } from "vitest";
import { MatchQueue } from "./matchmaking";
import type { Peer } from "./rooms";

function fakePeer(id: string): Peer & { inbox: any[] } {
  const inbox: any[] = [];
  return { id, inbox, send: (m) => inbox.push(m) };
}

describe("MatchQueue", () => {
  it("첫 진입자는 대기, 두 번째 진입 시 즉시 매칭된다", () => {
    const q = new MatchQueue(() => "ABCD");
    const a = fakePeer("a");
    const b = fakePeer("b");

    q.enqueue(a);
    expect(a.inbox).toHaveLength(0); // 아직 대기
    expect(q.waitingCount).toBe(1);

    q.enqueue(b);
    expect(a.inbox).toContainEqual({ t: "matched", code: "ABCD", role: "host" });
    expect(b.inbox).toContainEqual({ t: "matched", code: "ABCD", role: "guest" });
    expect(q.waitingCount).toBe(0);
  });

  it("두 쌍이 순서대로 각각 매칭된다", () => {
    const codes = ["C1", "C2"];
    const q = new MatchQueue(() => codes.shift()!);
    const [a, b, c, d] = ["a", "b", "c", "d"].map(fakePeer);
    q.enqueue(a);
    q.enqueue(b); // a+b = C1
    q.enqueue(c);
    q.enqueue(d); // c+d = C2
    expect(a.inbox[0].code).toBe("C1");
    expect(b.inbox[0].code).toBe("C1");
    expect(c.inbox[0].code).toBe("C2");
    expect(d.inbox[0].code).toBe("C2");
  });

  it("취소하면 대기열에서 빠져 다음 사람과 매칭되지 않는다", () => {
    const q = new MatchQueue(() => "ZZZZ");
    const a = fakePeer("a");
    const b = fakePeer("b");
    q.enqueue(a);
    q.remove(a); // 취소
    expect(q.waitingCount).toBe(0);
    q.enqueue(b);
    expect(b.inbox).toHaveLength(0); // 혼자 대기, 매칭 안 됨
    expect(q.waitingCount).toBe(1);
  });

  it("같은 peer가 중복 진입해도 자기 자신과 매칭되지 않는다", () => {
    const q = new MatchQueue(() => "XXXX");
    const a = fakePeer("a");
    q.enqueue(a);
    q.enqueue(a);
    expect(a.inbox).toHaveLength(0);
    expect(q.waitingCount).toBe(1);
  });

  it("다른 방식끼리는 매칭되지 않고, 같은 방식끼리만 짝지어진다", () => {
    const q = new MatchQueue(() => "MODE");
    const a = fakePeer("a"); // time
    const b = fakePeer("b"); // score
    const c = fakePeer("c"); // time
    q.enqueue(a, "time");
    q.enqueue(b, "score");
    expect(a.inbox).toHaveLength(0); // 방식이 달라 매칭 안 됨
    expect(b.inbox).toHaveLength(0);
    expect(q.waitingCount).toBe(2); // 방식별로 각각 1명 대기

    q.enqueue(c, "time"); // a와 같은 방식 → 매칭
    expect(a.inbox).toContainEqual({ t: "matched", code: "MODE", role: "host" });
    expect(c.inbox).toContainEqual({ t: "matched", code: "MODE", role: "guest" });
    expect(b.inbox).toHaveLength(0); // score 대기자는 그대로
    expect(q.waitingCount).toBe(1);
  });

  it("다른 방식으로 재진입하면 이전 방식 큐에서 빠진다(중복 대기 방지)", () => {
    const q = new MatchQueue(() => "ZZZZ");
    const a = fakePeer("a");
    q.enqueue(a, "time");
    q.enqueue(a, "score"); // 방식 변경
    expect(q.waitingCount).toBe(1); // time 큐에서 빠지고 score 큐에만
  });
});
