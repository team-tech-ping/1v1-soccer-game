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
};
