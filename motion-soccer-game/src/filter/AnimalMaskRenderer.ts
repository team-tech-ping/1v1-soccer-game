import * as THREE from "three";
import { buildAnimalMask, disposeMaskGroup } from "./AnimalMaskCatalog";
import { applyFaceTransform } from "./applyFaceTransform";

const VERTICAL_FOV_DEG = 63;
const BG_DISTANCE = 5000;

// [참고] facialTransformationMatrixes의 좌표 단위는 실측 결과 대략 1 unit ≈ 1cm(카메라~얼굴 거리 40cm일 때 z≈-45.7 등으로 확인됨).
// 실제 얼굴 크기(반지름 약 10cm) 정도로 보이도록 축소한다.
const MASK_SCALE = 0.11;

// 웹캠 프레임 위에 동물 마스크를 3D로 합성해 오프스크린 캔버스에 렌더링한다.
// 이 캔버스의 captureStream()이 실제로 상대에게 전송되는 트랙이 된다.
export class AnimalMaskRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private videoTexture: THREE.VideoTexture | null = null;
  private bgMesh: THREE.Mesh | null = null;
  // trackedGroup: MediaPipe 변환행렬을 그대로 받는 바깥 그룹(matrixAutoUpdate=false).
  // 실제 보이는 도형은 그 자식인 visual 그룹에 있고, MASK_SCALE만큼 축소되어 있다.
  private trackedGroup: THREE.Group | null = null;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
    });
    this.renderer.setSize(width, height, false);
    this.camera = new THREE.PerspectiveCamera(
      VERTICAL_FOV_DEG,
      width / height,
      1,
      10000,
    );
  }

  setAnimal(id: string): void {
    if (this.trackedGroup) {
      this.scene.remove(this.trackedGroup);
      disposeMaskGroup(this.trackedGroup);
    }
    const visual = buildAnimalMask(id);
    visual.scale.setScalar(MASK_SCALE);

    const tracked = new THREE.Group();
    tracked.matrixAutoUpdate = false;
    tracked.visible = false; // 최초 검출 전까지는 숨김
    tracked.add(visual);

    this.scene.add(tracked);
    this.trackedGroup = tracked;
  }

  render(video: HTMLVideoElement, matrix: Float32Array | null): void {
    this.ensureBackground(video);
    if (this.trackedGroup && matrix) {
      this.trackedGroup.visible = true;
      applyFaceTransform(this.trackedGroup, matrix);
    }
    this.renderer.render(this.scene, this.camera);
  }

  captureStream(fps: number): MediaStream {
    return this.canvas.captureStream(fps);
  }

  dispose(): void {
    if (this.trackedGroup) disposeMaskGroup(this.trackedGroup);
    this.bgMesh?.geometry.dispose();
    (this.bgMesh?.material as THREE.Material | undefined)?.dispose();
    this.videoTexture?.dispose();
    this.renderer.dispose();
  }

  private ensureBackground(video: HTMLVideoElement): void {
    if (this.bgMesh) return;
    this.videoTexture = new THREE.VideoTexture(video);
    // [fix] Texture 기본 colorSpace는 NoColorSpace(선형 취급)라 렌더러의 sRGB 출력 변환이 웹캠의 sRGB 픽셀에 중복 적용되어 색이 틀어진다. 명시적으로 sRGB임을 알려줘야 한다.
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = -1;

    const vFovRad = (this.camera.fov * Math.PI) / 180;
    const planeHeight = 2 * Math.tan(vFovRad / 2) * BG_DISTANCE;
    const planeWidth = planeHeight * this.camera.aspect;
    mesh.scale.set(planeWidth, planeHeight, 1);
    mesh.position.set(0, 0, -BG_DISTANCE);

    this.scene.add(mesh);
    this.bgMesh = mesh;
  }
}
