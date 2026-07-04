import type { Snapshot, EntityState, BallState, GuestInput } from "./protocol";
import type { InputState } from "../input/InputState";
import { Interpolator } from "./Interpolator";
import { INTERP_DELAY_MS } from "../config";

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

// guest 렌더 상태. 스냅샷 t(host 시계)와 guest 로컬 시계는 서로 다른 timeOrigin을 쓰므로,
// 수신 시점의 (localMs - snapshot.t) 최소값으로 오프셋을 추정해 host 시계로 환산한 뒤 보간한다.
// (min을 쓰면 지연이 가장 작았던 표본이 skew에 가장 가까워 안정적이다.)
export class GuestView {
  private interp = new Interpolator();
  private clockOffset: number | null = null; // localMs - hostSnapshotT 의 최소값
  private readonly interpDelayMs: number;

  constructor(interpDelayMs: number = INTERP_DELAY_MS) {
    this.interpDelayMs = interpDelayMs;
  }

  // recvLocalMs: 스냅샷이 guest에 도착한 시점의 performance.now()
  push(s: Snapshot, recvLocalMs: number): void {
    const offset = recvLocalMs - s.t;
    this.clockOffset = this.clockOffset === null ? offset : Math.min(this.clockOffset, offset);
    this.interp.push(s);
  }

  // localNowMs: 이번 프레임의 guest performance.now().
  // host 시계 추정값에서 interpDelayMs만큼 과거를 보간 렌더한다.
  render(localNowMs: number): Snapshot | null {
    if (this.clockOffset === null) return null; // 아직 스냅샷 없음
    const hostTimeEstimate = localNowMs - this.clockOffset;
    return this.interp.sample(hostTimeEstimate - this.interpDelayMs);
  }
}
