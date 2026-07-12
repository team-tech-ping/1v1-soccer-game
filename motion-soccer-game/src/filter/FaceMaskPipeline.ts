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
    const det = this.detector.detect(this.video, nowMs);
    this.lastMatrix = pickTransform(det?.result ?? null, this.lastMatrix);
    this.renderer.render(this.video, this.lastMatrix);
  }

  get outputStream(): MediaStream {
    return this.renderer.captureStream(FilterConfig.outputFps);
  }

  stop(): void {
    this.detector.close();
    this.renderer.dispose();
  }
}
