import { describe, it, expect } from "vitest";
import { Interpolator } from "./Interpolator";
import type { Snapshot } from "./protocol";

function snap(t: number, ballX: number): Snapshot {
  return {
    t,
    p1: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 },
    p2: { x: 0, y: 0, vx: 0, vy: 0, facing: -1 },
    ball: { x: ballX, y: 0, vx: 0, vy: 0 },
    scoreL: 0,
    scoreR: 0,
    clockMs: 0,
    phase: "playing",
  };
}

describe("Interpolator", () => {
  it("스냅샷이 없으면 null", () => {
    expect(new Interpolator().sample(0)).toBeNull();
  });

  it("스냅샷이 하나뿐이면 그것을 반환", () => {
    const it_ = new Interpolator();
    it_.push(snap(100, 10));
    expect(it_.sample(200)?.ball.x).toBe(10);
  });

  it("두 스냅샷 사이를 선형 보간한다", () => {
    const it_ = new Interpolator();
    it_.push(snap(0, 0));
    it_.push(snap(100, 100));
    // renderT=50 → 중간값 50
    expect(it_.sample(50)?.ball.x).toBeCloseTo(50);
    // renderT=25 → 25
    expect(it_.sample(25)?.ball.x).toBeCloseTo(25);
  });

  it("renderT가 최신 스냅샷보다 뒤면 최신값으로 clamp", () => {
    const it_ = new Interpolator();
    it_.push(snap(0, 0));
    it_.push(snap(100, 100));
    expect(it_.sample(200)?.ball.x).toBeCloseTo(100);
  });

  it("renderT가 가장 오래된 스냅샷보다 앞이면 가장 오래된 값", () => {
    const it_ = new Interpolator();
    it_.push(snap(100, 10));
    it_.push(snap(200, 20));
    expect(it_.sample(50)?.ball.x).toBeCloseTo(10);
  });

  it("scoreL/phase 같은 이산 필드는 보간하지 않고 앞 스냅샷 값을 쓴다", () => {
    const it_ = new Interpolator();
    const a = snap(0, 0);
    const b = { ...snap(100, 100), scoreL: 1, phase: "ended" as const };
    it_.push(a);
    it_.push(b);
    const s = it_.sample(50);
    expect(s?.scoreL).toBe(0);
    expect(s?.phase).toBe("playing");
  });
});
