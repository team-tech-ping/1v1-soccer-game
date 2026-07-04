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
  it("host가 보낸 스냅샷을 guest가 받아 보간 렌더에 반영한다", async () => {
    const hub = new FakeHub();
    const hostCh = hub.channel("host");
    const guestCh = hub.channel("guest");

    const view = new GuestView();
    guestCh.on(EV_SNAPSHOT, (p) => {
      if (isSnapshot(p)) view.push(p);
    });
    await hostCh.join();
    await guestCh.join();

    // host가 공을 x=0→100으로 이동시키며 두 스냅샷 전송
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 0, y: 0, vx: 0, vy: 0 } }, 0));
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 100, y: 0, vx: 0, vy: 0 } }, 100));

    // guest는 t=50 시점 보간값 ≈ 50
    expect(view.sample(50)?.ball.x).toBeCloseTo(50);
  });
});
