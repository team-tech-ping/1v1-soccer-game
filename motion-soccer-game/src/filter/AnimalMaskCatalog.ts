import * as THREE from "three";

export interface AnimalMaskDef {
  id: string;
  label: string;
}

// 선택 가능한 동물 마스크 목록. UI(HomeScene)와 렌더러가 공유함
export const ANIMAL_MASKS: AnimalMaskDef[] = [
  { id: "dog", label: "강아지" },
  { id: "cat", label: "고양이" },
  { id: "bear", label: "곰" },
];

export const DEFAULT_ANIMAL_ID = ANIMAL_MASKS[0].id;

// 얼굴 랜드마커의 변환행렬(facialTransformationMatrixes) 좌표계에 맞춘 대략적인 크기
export function buildAnimalMask(id: string): THREE.Group {
  switch (id) {
    case "cat":
      return buildCat();
    case "bear":
      return buildBear();
    case "dog":
    default:
      return buildDog();
  }
}

function buildDog(): THREE.Group {
  const group = new THREE.Group();
  const fur = new THREE.MeshBasicMaterial({
    color: 0xc48a4c,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: 0x3a2418,
    side: THREE.DoubleSide,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(95, 20, 16), fur);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(35, 40, 60, 16), fur);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -20, 90);
  group.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 10), inner);
  nose.position.set(0, -18, 118);
  group.add(nose);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(30, 70, 12), fur);
    ear.position.set(side * 75, 90, -10);
    ear.rotation.z = side * 0.35;
    group.add(ear);
  }
  return group;
}

function buildCat(): THREE.Group {
  const group = new THREE.Group();
  const fur = new THREE.MeshBasicMaterial({
    color: 0x9a9a9a,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    side: THREE.DoubleSide,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(90, 20, 16), fur);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(30, 14, 10), fur);
  snout.position.set(0, -25, 78);
  group.add(snout);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(10, 12, 8), inner);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -15, 100);
  group.add(nose);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(28, 60, 3), fur);
    ear.position.set(side * 65, 100, -20);
    ear.rotation.z = side * 0.5;
    group.add(ear);
  }
  return group;
}

function buildBear(): THREE.Group {
  const group = new THREE.Group();
  const fur = new THREE.MeshBasicMaterial({
    color: 0x5a3d2b,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: 0x2a1c14,
    side: THREE.DoubleSide,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(100, 20, 16), fur);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(45, 14, 10), fur);
  snout.position.set(0, -30, 85);
  group.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 10), inner);
  nose.position.set(0, -25, 122);
  group.add(nose);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(32, 12, 10), fur);
    ear.position.set(side * 78, 95, -30);
    group.add(ear);
  }
  return group;
}

export function disposeMaskGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
