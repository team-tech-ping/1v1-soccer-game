import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { FilterConfig } from "./FilterConfig";

export interface FaceDetectResult {
  result: FaceLandmarkerResult;
  inferenceMs: number;
}

// MediaPipe FaceLandmarker 래퍼. 비디오 프레임 → 얼굴 랜드마크 + 변환행렬.
export class FaceDetector {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(FilterConfig.wasmPath);
    try {
      this.landmarker = await this.create(vision, "GPU");
    } catch {
      this.landmarker = await this.create(vision, "CPU");
    }
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  // PoseDetector.detect()와 같은 프레임/타임스탬프로 호출된다.
  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): FaceDetectResult | null {
    if (!this.landmarker) return null;
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const inferenceMs = performance.now() - t0;
    return { result, inferenceMs };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  private create(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    delegate: "GPU" | "CPU",
  ): Promise<FaceLandmarker> {
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FilterConfig.modelPath, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
  }
}
