import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// 검출 결과에서 변환행렬을 뽑아내되, 실패 시 마지막으로 성공한 행렬을 그대로 유지한다(마스크 고정).
// 순수 함수라 DOM/WebGL 없이 단위 테스트 가능.
export function pickTransform(
  result: FaceLandmarkerResult | null | undefined,
  lastMatrix: Float32Array | null
): Float32Array | null {
  const data = result?.facialTransformationMatrixes?.[0]?.data;
  if (data) return new Float32Array(data);
  return lastMatrix;
}
