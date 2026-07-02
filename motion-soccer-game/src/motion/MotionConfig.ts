// 모션 인식 파라미터. 임계값·감도·스무딩을 한곳에서 조정한다.
export const MotionConfig = {
  // 카메라 해상도 (낮을수록 추론 빠름)
  cameraWidth: 640,
  cameraHeight: 480,
  // 거울 모드: 사용자가 자기 왼쪽으로 기울이면 캐릭터도 왼쪽으로 가도록 x를 반전
  mirror: true,

  // 좌우 판정: 고개(코)가 양 어깨 중심에서 벗어난 정도(어깨 너비로 정규화)가
  // 이 값을 넘으면 이동. 0 = 정면. 어깨 너비의 약 18%만큼 고개를 움직이면 발동.
  lateralThreshold: 0.05,

  // 점프 판정: 기준선 대비 코의 상승량(정규화)이 이 값을 넘으면 점프
  jumpThreshold: 0.03,
  jumpCooldownMs: 450,

  // 스무딩(EMA)
  emaAlphaFast: 0.5, // 좌표 흔들림 억제 (클수록 반응 빠름)
  baselineAlpha: 0.02, // 서 있는 기준 높이를 천천히 추적

  // MediaPipe 자원 (런타임에 CDN에서 로드)
  wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  modelPath:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
