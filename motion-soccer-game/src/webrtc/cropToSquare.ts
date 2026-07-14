// 웹캠(또는 필터 합성) 스트림을 정사각형으로 센터 크롭한 고정 크기 스트림으로 만든다.
//
// 목적:
//  1) 카메라마다 원본 가로세로 비율(4:3, 16:9 등)이 달라 원형 카메라 확대 배율이
//     사용자마다 다르게 보이던 문제 — 정사각형 크롭은 원본 비율과 무관하게 항상
//     동일한 크롭 비율을 적용한다.
//  2) 내 로컬 미리보기와 상대에게 전송되는 스트림이 서로 다른 파이프라인(원본 그대로
//     vs WebRTC 인코딩)을 거치며 달라 보이던 문제 — 크롭을 전송 '이전'에 한 번만
//     적용하고, 로컬 미리보기도 그 결과를 그대로 재사용해 둘이 항상 동일한 픽셀에서
//     출발하게 한다.
//  3) 화면에는 작은 원(수십 px)으로만 보이는데 원본 해상도(640x480 등)를 그대로
//     전송하는 것은 낭비 — 필요한 크기로만 잘라 보내 대역폭도 아낀다.
export interface SquareCrop {
  stream: MediaStream;
  stop(): void;
}

const DEFAULT_SIZE = 128;
// 정사각형으로 자를 때 프레임 중앙을 이 배율만큼 더 당겨서(줌인) 크롭한다.
// 1.0 = 짧은 변 전체(원본 그대로의 비율감), 클수록 얼굴이 원을 더 채운다.
const DEFAULT_ZOOM = 1.4;

export function cropToSquare(
  source: MediaStream,
  size: number = DEFAULT_SIZE,
  zoom: number = DEFAULT_ZOOM
): SquareCrop {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = source;
  void video.play();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  let raf = 0;
  const draw = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0) {
      const side = Math.min(vw, vh) / zoom;
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return {
    stream: canvas.captureStream(30),
    stop: () => {
      cancelAnimationFrame(raf);
      video.pause();
      video.srcObject = null;
    },
  };
}
