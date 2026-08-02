import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface AnimalMaskDef {
  id: string;
  label: string;
}

// 선택 가능한 동물/얼굴 마스크 목록. UI(HomeScene)와 렌더러가 공유함
export const ANIMAL_MASKS: AnimalMaskDef[] = [
  { id: "dog", label: "강아지" },
  { id: "cat", label: "고양이" },
  { id: "bear", label: "곰" },
  { id: "jack_o_lantern", label: "잭오랜턴" },
];

export const DEFAULT_ANIMAL_ID = ANIMAL_MASKS[0].id;

const gltfLoader = new GLTFLoader();

// 절차적 마스크(머리 반지름 90~100)와 비슷한 크기 규약으로 맞추기 위한 기본 목표 높이.
// GLB 원본들은 실제 크기(강아지 한 마리, 호박, 석상)로 만들어져 있어 그대로 쓰면
// 렌더러의 MASK_SCALE을 곱했을 때 절차적 마스크와 크기가 안 맞는다 — 로드 시점에
// 바운딩 박스 높이를 이 값으로 정규화한다. 동물별로 크기가 다르게 느껴지면
// 아래 각자의 TARGET_HEIGHT 상수만 조정하면 된다(숫자가 클수록 크게 보임).
const GLTF_MASK_DEFAULT_HEIGHT = 190;

const DOG_MODEL_URL = "/assets/face_filter/animal_dog.glb";
const DOG_TARGET_HEIGHT = GLTF_MASK_DEFAULT_HEIGHT;

const JACK_O_LANTERN_MODEL_URL = "/assets/face_filter/jack_o_lantern.glb";
const JACK_O_LANTERN_TARGET_HEIGHT = 250;
// 바운딩 박스 자동 중심 정렬만으로는 눈/코/입 위치가 실제 얼굴과 안 맞을 때 쓰는 수동 보정.
// 잭오랜턴은 꼭지(줄기)가 위에 있어 바운딩 박스 중심이 실제 얼굴(눈코입 새겨진 부분)보다
// 위로 치우쳐 있는 것으로 추정된다 — y를 음수로 내리면 마스크가 화면에서 아래로 내려온다.
// 단위는 GLB 원본(스케일 적용 전)의 자체 좌표계라 모델마다 의미가 다르다 — 웹캠으로 보면서
// 눈/코/입이 실제 얼굴과 맞을 때까지 이 값만 조정하면 된다.
const JACK_O_LANTERN_OFFSET = new THREE.Vector3(0, -40, 0);

const MOAI_MODEL_URL = "/assets/face_filter/tete_monumentale_de_moai.glb";
const MOAI_TARGET_HEIGHT = GLTF_MASK_DEFAULT_HEIGHT;
const MOAI_OFFSET = new THREE.Vector3(0, 0, 0);

// 얼굴 랜드마커의 변환행렬(facialTransformationMatrixes) 좌표계에 맞춘 대략적인 크기
export async function buildAnimalMask(id: string): Promise<THREE.Group> {
  switch (id) {
    case "cat":
      return buildCat();
    case "bear":
      return buildBear();
    case "jack_o_lantern":
      return loadGltfMask(
        JACK_O_LANTERN_MODEL_URL,
        JACK_O_LANTERN_TARGET_HEIGHT,
        emptyMask,
        JACK_O_LANTERN_OFFSET,
      );
    case "moai":
      return loadGltfMask(
        MOAI_MODEL_URL,
        MOAI_TARGET_HEIGHT,
        emptyMask,
        MOAI_OFFSET,
      );
    case "dog":
    default:
      return loadGltfMask(DOG_MODEL_URL, DOG_TARGET_HEIGHT, buildDog);
  }
}

// GLB를 로드해 바운딩 박스 중심을 원점으로, 높이를 targetHeight로 정규화한다.
// offset은 자동 중심 정렬 후 추가로 밀어주는 수동 보정(눈/코/입을 실제 얼굴에 맞추는 용도).
// 로드 실패 시(네트워크 등) fallback으로 대체.
async function loadGltfMask(
  url: string,
  targetHeight: number,
  fallback: () => THREE.Group,
  offset = new THREE.Vector3(),
): Promise<THREE.Group> {
  try {
    const gltf = await gltfLoader.loadAsync(url);
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center); // 바운딩 박스 중심을 원점으로
    model.position.add(offset); // 필요 시 눈/코/입 위치에 맞춰 수동 보정

    const scale = targetHeight / (size.y || 1);
    model.scale.setScalar(scale);

    const group = new THREE.Group();
    group.add(model);
    return group;
  } catch (e) {
    console.warn(
      `[animal-mask] 3D 모델 로드 실패(${url}) — 대체 마스크로 전환`,
      e,
    );
    return fallback();
  }
}

function emptyMask(): THREE.Group {
  return new THREE.Group();
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
