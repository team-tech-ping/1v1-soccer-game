import type { Snapshot, EntityState, BallState, GuestInput } from "./protocol";
import type { InputState } from "../input/InputState";
import { Interpolator } from "./Interpolator";

// host가 매 스냅샷마다 스프라이트/게임 상태에서 읽어 채우는 값.
export interface WorldReadout {
  p1: EntityState;
  p2: EntityState;
  ball: BallState;
  scoreL: number;
  scoreR: number;
  clockMs: number;
  phase: "playing" | "ended";
}

export function buildSnapshot(w: WorldReadout, t: number): Snapshot {
  return {
    t,
    p1: w.p1,
    p2: w.p2,
    ball: w.ball,
    scoreL: w.scoreL,
    scoreR: w.scoreR,
    clockMs: w.clockMs,
    phase: w.phase,
  };
}

export function inputToMessage(input: InputState, seq: number): GuestInput {
  return {
    seq,
    moveLeft: input.moveLeft,
    moveRight: input.moveRight,
    jump: input.jump,
  };
}

export function messageToInput(msg: GuestInput): InputState {
  return { moveLeft: msg.moveLeft, moveRight: msg.moveRight, jump: msg.jump };
}

// guest 렌더 상태. 현재는 Interpolator에 얇게 위임하며,
// 향후 로컬 예측을 붙일 경우의 확장 지점이다.
export class GuestView {
  private interp = new Interpolator();

  push(s: Snapshot): void {
    this.interp.push(s);
  }
  sample(renderT: number): Snapshot | null {
    return this.interp.sample(renderT);
  }
}
