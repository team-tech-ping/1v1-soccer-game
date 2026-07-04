import { describe, it, expect } from "vitest";
import { buildSnapshot, inputToMessage, messageToInput, type WorldReadout } from "./sync";

const world: WorldReadout = {
  p1: { x: 10, y: 20, vx: 1, vy: 2, facing: 1 },
  p2: { x: 30, y: 40, vx: 3, vy: 4, facing: -1 },
  ball: { x: 50, y: 60, vx: 5, vy: 6 },
  scoreL: 1,
  scoreR: 2,
  clockMs: 90000,
  phase: "playing",
};

describe("sync", () => {
  it("buildSnapshot은 world와 t를 스냅샷으로 옮긴다", () => {
    const s = buildSnapshot(world, 1234);
    expect(s.t).toBe(1234);
    expect(s.p1).toEqual(world.p1);
    expect(s.ball.x).toBe(50);
    expect(s.scoreL).toBe(1);
    expect(s.phase).toBe("playing");
  });

  it("input↔message 왕복이 보존된다", () => {
    const msg = inputToMessage({ moveLeft: true, moveRight: false, jump: true }, 7);
    expect(msg).toEqual({ seq: 7, moveLeft: true, moveRight: false, jump: true });
    const back = messageToInput(msg);
    expect(back).toEqual({ moveLeft: true, moveRight: false, jump: true });
  });
});

import { FakeHub } from "./NetChannel";
import { GuestView } from "./sync";
import { EV_SNAPSHOT } from "./protocol";
import { isSnapshot } from "./protocol";

describe("host→guest 동기화 (fake channel)", () => {
  it("host가 보낸 스냅샷을 guest가 받아 보간 렌더에 반영한다 (clock-domain 매핑 포함)", async () => {
    const hub = new FakeHub();
    const hostCh = hub.channel("host");
    const guestCh = hub.channel("guest");

    // host의 performance.now()와 guest의 performance.now()는 서로 다른 timeOrigin을 쓰므로
    // 두 시계는 큰 상수 오프셋만큼 어긋나 있다고 가정한다. 이 테스트는 GuestView가 그 오프셋을
    // 추정해 host 시계로 환산한 뒤 보간하는지 검증한다 — 잘못 구현되면 렌더 시각이 항상
    // 버퍼 범위를 벗어나 Interpolator.sample의 clamp 분기(최신 스냅샷 그대로 반환)를 타게 되고,
    // 아래 toBeCloseTo(50) 단언이 100(최신값)이 되어 실패한다.
    const OFFSET = 100_000; // guest local = host t + OFFSET
    const DELAY = 100;
    const view = new GuestView(DELAY);
    guestCh.on(EV_SNAPSHOT, (p) => {
      if (isSnapshot(p)) view.push(p, p.t + OFFSET);
    });
    await hostCh.join();
    await guestCh.join();

    // host가 공을 x=0→100으로 이동시키며 t=0,50,100,150 네 스냅샷 전송
    // (렌더 목표가 최신 스냅샷이 아니라 버퍼 중간에 오도록 여유 스냅샷을 추가)
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 0, y: 0, vx: 0, vy: 0 } }, 0));
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 50, y: 0, vx: 0, vy: 0 } }, 50));
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 100, y: 0, vx: 0, vy: 0 } }, 100));
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 150, y: 0, vx: 0, vy: 0 } }, 150));

    // guestLocalNow를 골라 host 시계 환산값(guestLocalNow - OFFSET - DELAY)이 t=0과 t=50 사이(25)에 오도록 한다.
    const guestLocalNow = 25 + DELAY + OFFSET;
    expect(view.render(guestLocalNow)?.ball.x).toBeCloseTo(25);
  });
});
