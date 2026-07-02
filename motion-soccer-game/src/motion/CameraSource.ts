import { MotionConfig } from "./MotionConfig";

export type CameraErrorKind = "permission" | "notfound" | "inuse" | "unknown";

// 사용자 친화적 메시지를 담은 카메라 접근 오류.
export class CameraAccessError extends Error {
  constructor(public readonly kind: CameraErrorKind, message: string) {
    super(message);
    this.name = "CameraAccessError";
  }
}

// 웹캠 비디오 스트림을 획득하고 권한/오류를 처리한다.
export class CameraSource {
  public readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;

  constructor() {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: MotionConfig.cameraWidth,
          height: MotionConfig.cameraHeight,
          facingMode: "user",
        },
        audio: false,
      });
    } catch (e) {
      throw this.classify(e);
    }

    this.video.srcObject = this.stream;
    await this.video.play();
    await this.waitForData();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private waitForData(): Promise<void> {
    return new Promise((resolve) => {
      if (this.video.readyState >= 2) {
        resolve();
        return;
      }
      this.video.onloadeddata = () => resolve();
    });
  }

  private classify(e: unknown): CameraAccessError {
    const name = e instanceof Error ? e.name : "";
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        return new CameraAccessError("permission", "카메라 권한이 거부됨");
      case "NotFoundError":
      case "OverconstrainedError":
        return new CameraAccessError("notfound", "카메라를 찾을 수 없음");
      case "NotReadableError":
        return new CameraAccessError("inuse", "카메라가 다른 앱에서 사용 중");
      default:
        return new CameraAccessError("unknown", "카메라 접근 실패");
    }
  }
}
