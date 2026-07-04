import type { Snapshot, EntityState, BallState } from "./protocol";

const BUFFER_MAX = 12; // 오래된 스냅샷은 버린다

// guest 렌더용 스냅샷 보간기.
// push로 host 스냅샷을 쌓고, sample(renderT)로 그 시점의 위치를 선형 보간해 얻는다.
// 위치/속도만 보간하고 점수·phase 같은 이산 필드는 앞(older) 스냅샷 값을 사용한다.
export class Interpolator {
  private buffer: Snapshot[] = []; // t 오름차순

  push(s: Snapshot): void {
    this.buffer.push(s);
    this.buffer.sort((a, b) => a.t - b.t);
    if (this.buffer.length > BUFFER_MAX) {
      this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    }
  }

  get latest(): Snapshot | null {
    return this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
  }

  sample(renderT: number): Snapshot | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    const first = this.buffer[0];
    const last = this.buffer[this.buffer.length - 1];
    if (renderT <= first.t) return first;
    if (renderT >= last.t) return last;

    // renderT를 감싸는 두 스냅샷 [a, b] 찾기
    let a = first;
    let b = last;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].t <= renderT && renderT <= this.buffer[i + 1].t) {
        a = this.buffer[i];
        b = this.buffer[i + 1];
        break;
      }
    }

    const span = b.t - a.t;
    const alpha = span > 0 ? (renderT - a.t) / span : 0;

    return {
      t: renderT,
      p1: lerpEntity(a.p1, b.p1, alpha),
      p2: lerpEntity(a.p2, b.p2, alpha),
      ball: lerpBall(a.ball, b.ball, alpha),
      // 이산 필드: 앞 스냅샷 값 유지
      scoreL: a.scoreL,
      scoreR: a.scoreR,
      clockMs: a.clockMs,
      phase: a.phase,
    };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpEntity(a: EntityState, b: EntityState, t: number): EntityState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
    facing: t < 0.5 ? a.facing : b.facing,
  };
}

function lerpBall(a: BallState, b: BallState, t: number): BallState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
  };
}
