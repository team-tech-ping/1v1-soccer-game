import { FaceDetector } from "./FaceDetector";
import { AnimalMaskRenderer } from "./AnimalMaskRenderer";
import { pickTransform } from "./FaceTransformTracker";
import { FilterConfig } from "./FilterConfig";
import { DEFAULT_ANIMAL_ID } from "./AnimalMaskCatalog";

// 웹캠 프레임에 동물 마스크를 합성해 상대에게 전송할 스트림을 만든다.
// update(nowMs)는 PoseDetector.detect()와 같은 프레임/타임스탬프로,
// PlayScene.update()에서 motion.poll(now)와 나란히 호출되어야 한다.
export class FaceMaskPipeline {
  private readonly detector = new FaceDetector();
  private readonly renderer: AnimalMaskRenderer;
  private lastMatrix: Float32Array | null = null;
  private initialized = false;
  private lastUpdateMs = -Infinity;
  // 진단용: 마지막 얼굴 추론/Three 렌더 소요(ms)
  public lastInferenceMs = 0;
  public lastRenderMs = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    animalId: string = DEFAULT_ANIMAL_ID
  ) {
    this.renderer = new AnimalMaskRenderer(FilterConfig.canvasWidth, FilterConfig.canvasHeight);
    this.renderer.setAnimal(animalId);
  }

  async init(): Promise<void> {
    await this.detector.init();
    this.initialized = true;
  }

  get ready(): boolean {
    return this.initialized;
  }

  setAnimal(animalId: string): void {
    this.renderer.setAnimal(animalId);
  }

  update(nowMs: number): void {
    if (!this.initialized) return;
    // 검출+렌더를 outputFps 수준으로 throttle (포즈 추론과 매 프레임 겹쳐 버벅이는 것 방지).
    if (nowMs - this.lastUpdateMs < FilterConfig.updateIntervalMs) return;
    this.lastUpdateMs = nowMs;
    const det = this.detector.detect(this.video, nowMs);
    this.lastInferenceMs = det?.inferenceMs ?? 0;
    this.lastMatrix = pickTransform(det?.result ?? null, this.lastMatrix);
    const t0 = performance.now();
    this.renderer.render(this.video, this.lastMatrix);
    this.lastRenderMs = performance.now() - t0;
  }

  get outputStream(): MediaStream {
    return this.renderer.captureStream(FilterConfig.outputFps);
  }

  stop(): void {
    this.detector.close();
    this.renderer.dispose();
  }
}
