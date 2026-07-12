import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyFaceTransform } from "./applyFaceTransform";

describe("applyFaceTransform", () => {
  it("매 프레임 변경된 변환행렬이 matrixWorld에 실제로 반영된다", () => {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;

    const m1 = new THREE.Matrix4().makeTranslation(10, 20, 30);
    applyFaceTransform(group, new Float32Array(m1.elements));
    group.updateMatrixWorld(); // 렌더러가 매 프레임 호출하는 것과 동일 (force 없음)

    const m2 = new THREE.Matrix4().makeTranslation(50, 60, 70);
    applyFaceTransform(group, new Float32Array(m2.elements));
    group.updateMatrixWorld();

    const pos = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
    expect(pos.x).toBeCloseTo(50);
    expect(pos.y).toBeCloseTo(60);
    expect(pos.z).toBeCloseTo(70);
  });
});
