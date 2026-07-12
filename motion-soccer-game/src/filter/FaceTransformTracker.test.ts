import { describe, expect, it } from "vitest";
import { pickTransform } from "./FaceTransformTracker";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

function resultWith(data: number[] | undefined): FaceLandmarkerResult {
  return {
    facialTransformationMatrixes: data ? [{ data, rows: 4, columns: 4, packedData: () => new Float32Array(data) }] : [],
  } as unknown as FaceLandmarkerResult;
}

describe("pickTransform", () => {
  it("검출 성공 시 새 변환행렬을 반환한다", () => {
    const m = pickTransform(resultWith([1, 2, 3, 4]), null);
    expect(m).toEqual(new Float32Array([1, 2, 3, 4]));
  });

  it("검출 실패(얼굴 없음) 시 마지막 행렬을 그대로 유지한다", () => {
    const last = new Float32Array([9, 9, 9]);
    const m = pickTransform(resultWith(undefined), last);
    expect(m).toBe(last);
  });

  it("검출 자체가 없고(result null) 이전 값도 없으면 null을 반환한다", () => {
    expect(pickTransform(null, null)).toBeNull();
  });

  it("연속 실패 프레임에서도 최초 성공 행렬을 계속 유지한다(무기한 고정)", () => {
    const first = pickTransform(resultWith([5, 5, 5]), null)!;
    const second = pickTransform(resultWith(undefined), first);
    const third = pickTransform(resultWith(undefined), second);
    expect(third).toBe(first);
  });
});
