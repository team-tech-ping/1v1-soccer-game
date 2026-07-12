import { MotionConfig } from "../motion/MotionConfig";

// 얼굴 마스크 필터 파라미터.
export const FilterConfig = {
  wasmPath: MotionConfig.wasmPath,
  modelPath:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

  // 합성 캔버스 해상도 (카메라 해상도와 동일하게 맞춘다)
  canvasWidth: MotionConfig.cameraWidth,
  canvasHeight: MotionConfig.cameraHeight,
  outputFps: 30,

  // 얼굴 검출 + 마스크 렌더(Three.js)를 이 주기로 throttle한다.
  // 출력이 outputFps(30)이므로 그보다 자주 돌 필요가 없고, 포즈 추론과 겹쳐
  // 메인 스레드가 버벅이는 것을 막는다. 변환행렬은 스무딩되므로 시각적으로 자연스럽다.
  updateIntervalMs: 66, // ≈15Hz — 얼굴 추론(≈20ms)이 유일한 병목이라 빈도를 낮춰 게임 프레임 확보
};
