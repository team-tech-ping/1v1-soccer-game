import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { MotionConfig } from "./MotionConfig";

export interface DetectResult {
  result: PoseLandmarkerResult;
  inferenceMs: number;
}

// MediaPipe PoseLandmarker 래퍼. 비디오 프레임 → 포즈 랜드마크.
// GPU 가속을 우선 시도하고, 실패하면 CPU로 폴백한다.
export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(MotionConfig.wasmPath);
    try {
      this.landmarker = await this.create(vision, "GPU");
    } catch {
      this.landmarker = await this.create(vision, "CPU");
    }
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  // timestampMs는 호출마다 단조 증가해야 한다(VIDEO 모드 요구사항).
  detect(video: HTMLVideoElement, timestampMs: number): DetectResult | null {
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
    delegate: "GPU" | "CPU"
  ): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MotionConfig.modelPath, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
}
