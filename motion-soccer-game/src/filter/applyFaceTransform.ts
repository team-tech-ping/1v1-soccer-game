import type * as THREE from "three";

// matrixAutoUpdate=false인 객체에 MediaPipe 변환행렬을 적용한다.
// matrixWorldNeedsUpdate를 함께 세팅하지 않으면 matrixWorld가 항상 identity(카메라 위치)에
// 머물러 near-plane 밖으로 렌더링되지 않는다 — three.js Object3D.updateMatrixWorld()는
// matrixAutoUpdate=false일 때 matrixWorldNeedsUpdate 플래그가 true여야만 matrixWorld를 갱신한다.
export function applyFaceTransform(group: THREE.Object3D, matrix: Float32Array): void {
  group.matrix.fromArray(matrix);
  group.matrixWorldNeedsUpdate = true;
}
