import { describe, it, expect } from "vitest";
import { isSnapshot, isGuestInput, isMatchEvent, type Snapshot } from "./protocol";

const validSnapshot: Snapshot = {
  t: 1000,
  p1: { x: 1, y: 2, vx: 0, vy: 0, facing: 1 },
  p2: { x: 3, y: 4, vx: 0, vy: 0, facing: -1 },
  ball: { x: 5, y: 6, vx: 0, vy: 0 },
  scoreL: 0,
  scoreR: 0,
  clockMs: 120000,
  phase: "playing",
};

describe("protocol guards", () => {
  it("유효한 Snapshot을 통과시킨다", () => {
    expect(isSnapshot(validSnapshot)).toBe(true);
  });

  it("필드가 빠진 Snapshot을 거부한다", () => {
    const { ball: _ball, ...broken } = validSnapshot;
    expect(isSnapshot(broken)).toBe(false);
  });

  it("null/원시값을 거부한다", () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot(42)).toBe(false);
  });

  it("유효한 GuestInput을 통과시킨다", () => {
    expect(isGuestInput({ seq: 1, moveLeft: true, moveRight: false, jump: false })).toBe(true);
  });

  it("타입이 틀린 GuestInput을 거부한다", () => {
    expect(isGuestInput({ seq: "1", moveLeft: true, moveRight: false, jump: false })).toBe(false);
  });

  it("유효한 MatchEvent를 통과시킨다", () => {
    expect(isMatchEvent({ kind: "matchStart" })).toBe(true);
    expect(isMatchEvent({ kind: "matchEnd", winner: "left" })).toBe(true);
  });

  it("알 수 없는 kind를 거부한다", () => {
    expect(isMatchEvent({ kind: "nope" })).toBe(false);
  });

  it("타입이 틀린 optional 필드를 가진 MatchEvent를 거부한다", () => {
    expect(isMatchEvent({ kind: "goal", scoreL: "5" })).toBe(false);
    expect(isMatchEvent({ kind: "matchEnd", winner: "nope" })).toBe(false);
  });

  it("유효한 optional 필드를 가진 MatchEvent를 통과시킨다", () => {
    expect(isMatchEvent({ kind: "goal", scoreL: 1, scoreR: 2 })).toBe(true);
    expect(isMatchEvent({ kind: "matchEnd", winner: "draw" })).toBe(true);
  });

  it("t가 NaN인 Snapshot을 거부한다", () => {
    expect(isSnapshot({ ...validSnapshot, t: NaN })).toBe(false);
  });
});
