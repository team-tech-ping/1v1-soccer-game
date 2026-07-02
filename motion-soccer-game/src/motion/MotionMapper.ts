import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { createEmptyInputState, type InputState } from "../input/InputState";
import { MotionConfig } from "./MotionConfig";

// MediaPipe Pose 랜드마크 인덱스
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export interface MotionDebug {
  detected: boolean;
  offsetX: number; // 중심 대비 좌우 오프셋(정규화). 음수=왼쪽, 양수=오른쪽
  riseY: number; // 기준선 대비 상승량(정규화). 양수=위로 올라감
}

// 포즈 랜드마크를 InputState(좌우/점프)로 변환한다.
// - 좌우: 고개(코)가 양 어깨 중심에서 벗어난 정도(어깨 너비로 정규화)를 기준과 비교
// - 점프: 코의 y가 기준 높이보다 빠르게 올라가면 트리거
// 좌표에는 EMA 스무딩을 적용해 캐릭터 떨림을 막는다.
export class MotionMapper {
  private smoothX = 0.5;
  private smoothY = 0.5;
  private centerX = 0.5; // 좌우 중립 기준
  private baselineY = 0.5; // 서 있는 높이 기준
  private initialized = false;
  private lastJumpAt = Number.NEGATIVE_INFINITY;

  // 현재 자세를 중립 기준으로 재설정한다.
  calibrate(): void {
    this.centerX = this.smoothX;
    this.baselineY = this.smoothY;
  }

  update(
    result: PoseLandmarkerResult,
    nowMs: number
  ): { input: InputState; debug: MotionDebug } {
    const input = createEmptyInputState();
    const poses = result.landmarks;

    if (!poses || poses.length === 0) {
      return { input, debug: { detected: false, offsetX: 0, riseY: 0 } };
    }

    const lm = poses[0];
    const nose = lm[NOSE];
    const ls = lm[LEFT_SHOULDER];
    const rs = lm[RIGHT_SHOULDER];

    // 고개 좌우: 코가 어깨 중심에서 얼마나 벗어났는지를 어깨 너비로 정규화.
    // 0 = 정면, 양수/음수 = 한쪽으로 고개를 움직임. 거리·체격에 무관.
    const shoulderCenterX = (ls.x + rs.x) / 2;
    const shoulderWidth = Math.abs(ls.x - rs.x) || 1e-6;
    let cx = (nose.x - shoulderCenterX) / shoulderWidth;
    if (MotionConfig.mirror) cx = -cx; // 0 중심 오프셋이므로 부호만 반전

    // 점프: 코의 수직 위치를 기준 높이와 비교
    const cy = nose.y;

    if (!this.initialized) {
      this.smoothX = cx;
      this.smoothY = cy;
      this.centerX = cx;
      this.baselineY = cy;
      this.initialized = true;
    } else {
      const a = MotionConfig.emaAlphaFast;
      this.smoothX = a * cx + (1 - a) * this.smoothX;
      this.smoothY = a * cy + (1 - a) * this.smoothY;
    }

    // 기준 높이는 천천히 추적 → 순간적인 점프 상승은 riseY로 크게 잡힌다.
    const b = MotionConfig.baselineAlpha;
    this.baselineY = b * this.smoothY + (1 - b) * this.baselineY;

    const offsetX = this.smoothX - this.centerX;
    const riseY = this.baselineY - this.smoothY; // 위로 가면 y가 작아짐 → 양수

    if (offsetX < -MotionConfig.lateralThreshold) {
      input.moveLeft = true;
    } else if (offsetX > MotionConfig.lateralThreshold) {
      input.moveRight = true;
    }

    if (
      riseY > MotionConfig.jumpThreshold &&
      nowMs - this.lastJumpAt > MotionConfig.jumpCooldownMs
    ) {
      input.jump = true;
      this.lastJumpAt = nowMs;
    }

    return { input, debug: { detected: true, offsetX, riseY } };
  }
}
