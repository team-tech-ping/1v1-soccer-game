import { CameraSource, CameraAccessError } from "./CameraSource";
import { PoseDetector } from "./PoseDetector";
import { MotionMapper, type MotionDebug } from "./MotionMapper";
import { createEmptyInputState, type InputState } from "../input/InputState";

export type MotionStatus = "idle" | "loading" | "ready" | "error";

const PREVIEW_ID = "motion-preview";

// 모션 파이프라인 오케스트레이션: 카메라 → 포즈 추론 → 입력 매핑.
// 매 프레임 poll()로 최신 InputState를 얻는다. 여러 씬에서 재사용한다.
export class MotionController {
  private camera = new CameraSource();
  private detector = new PoseDetector();
  private mapper = new MotionMapper();

  private status: MotionStatus = "idle";
  private errorMessage: string | null = null;
  private latency = 0;
  private lastDebug: MotionDebug = { detected: false, offsetX: 0, riseY: 0 };
  private current = createEmptyInputState();

  // 카메라 권한 → 모델 로드. 실패 시 status='error'로 두고 throw하지 않는다.
  async start(): Promise<void> {
    this.status = "loading";
    try {
      await this.camera.start();
    } catch (e) {
      this.errorMessage = e instanceof CameraAccessError ? e.message : "카메라 오류";
      this.status = "error";
      return;
    }
    try {
      await this.detector.init();
    } catch {
      this.errorMessage = "모델 로드 실패 (네트워크 확인)";
      this.status = "error";
      return;
    }
    this.status = "ready";
  }

  get state(): MotionStatus {
    return this.status;
  }
  get error(): string | null {
    return this.errorMessage;
  }
  get ready(): boolean {
    return this.status === "ready";
  }
  get latencyMs(): number {
    return this.latency;
  }
  get debug(): MotionDebug {
    return this.lastDebug;
  }
  get video(): HTMLVideoElement {
    return this.camera.video;
  }
  // 획득한 웹캠 스트림(카메라 시작 성공 시 non-null). WebRTC 카메라 공유가 재사용한다.
  get stream(): MediaStream | null {
    return this.camera.stream;
  }

  // 매 프레임 호출. nowMs는 단조 증가해야 한다(VIDEO 모드 요구).
  poll(nowMs: number): InputState {
    if (this.status !== "ready") {
      return this.current;
    }
    const det = this.detector.detect(this.camera.video, nowMs);
    if (!det) {
      // 감지 실패 프레임: 점프 에지가 남지 않도록 클리어
      this.current = { ...this.current, jump: false };
      return this.current;
    }
    this.latency = det.inferenceMs;
    const { input, debug } = this.mapper.update(det.result, nowMs);
    this.lastDebug = debug;
    this.current = input;
    return input;
  }

  // 현재 자세를 중립 기준으로 보정.
  calibrate(): void {
    this.mapper.calibrate();
  }

  // 웹캠 미리보기를 화면 우상단에 띄운다(거울 모드).
  attachPreview(): void {
    const v = this.camera.video;
    v.id = PREVIEW_ID;
    Object.assign(v.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      width: "200px",
      borderRadius: "8px",
      transform: "scaleX(-1)",
      zIndex: "10",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(v);
  }

  stop(): void {
    this.detector.close();
    this.camera.stop();
    document.getElementById(PREVIEW_ID)?.remove();
  }
}
