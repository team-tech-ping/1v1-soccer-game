// 캔버스 위에 얹는 비디오 오버레이. 로컬(나)/원격(상대) 웹캠을 코너에 표시한다.
export interface VideoOverlayOpts {
  id: string;
  corner: "left" | "right";
  label: string;
  mirror?: boolean; // 로컬(내 화면)은 거울 모드가 자연스럽다
}

export class VideoOverlay {
  private readonly video: HTMLVideoElement;
  private readonly caption: HTMLDivElement;

  constructor(opts: VideoOverlayOpts) {
    this.video = document.createElement("video");
    this.video.id = opts.id;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    const side = opts.corner === "left" ? { left: "12px" } : { right: "12px" };
    Object.assign(this.video.style, {
      position: "fixed",
      top: "12px",
      width: "200px",
      borderRadius: "8px",
      background: "#000",
      transform: opts.mirror ? "scaleX(-1)" : "none",
      zIndex: "10",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      ...side,
    } as Partial<CSSStyleDeclaration>);

    this.caption = document.createElement("div");
    this.caption.textContent = opts.label;
    Object.assign(this.caption.style, {
      position: "fixed",
      top: "166px", // 200px 폭 비디오(≈150px 높이) 아래
      fontFamily: "sans-serif",
      fontSize: "13px",
      color: "#e0e1dd",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      zIndex: "11",
      ...side,
    } as Partial<CSSStyleDeclaration>);

    document.body.appendChild(this.video);
    document.body.appendChild(this.caption);
  }

  setStream(stream: MediaStream): void {
    this.video.srcObject = stream;
    void this.video.play();
  }

  // 진단용: 오버레이를 완전히 끄고(숨김+정지) 켠다. 디코드/합성 비용 격리에 사용.
  setActive(active: boolean): void {
    this.video.style.display = active ? "" : "none";
    this.caption.style.display = active ? "" : "none";
    if (active) void this.video.play();
    else this.video.pause();
  }

  remove(): void {
    this.video.srcObject = null;
    this.video.remove();
    this.caption.remove();
  }
}
