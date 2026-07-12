import type { SignalingClient, SignalPayload } from "./SignalingClient";

// WebRTC 카메라 공유. 로컬 웹캠 스트림을 상대에게 P2P로 보내고, 상대 스트림을 받는다.
// 시그널링(offer/answer/ICE)은 SignalingClient(Railway)를 통해 교환한다.
//  - initiator(host): 상대 입장 시 offer를 만든다.
//  - 상대(guest): offer를 받으면 answer로 응답한다.

interface OfferMsg {
  kind: "offer";
  sdp: RTCSessionDescriptionInit;
}
interface AnswerMsg {
  kind: "answer";
  sdp: RTCSessionDescriptionInit;
}
interface IceMsg {
  kind: "ice";
  candidate: RTCIceCandidateInit;
}
type SignalMsg = OfferMsg | AnswerMsg | IceMsg;

// 공용 STUN(구글). 대부분의 네트워크에서 P2P 연결에 충분하다.
// 대칭 NAT 등에서 실패하면 이후 TURN 서버를 추가한다(다음 단계).
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function isSignalMsg(v: unknown): v is SignalMsg {
  return (
    typeof v === "object" &&
    v !== null &&
    (["offer", "answer", "ice"] as const).includes((v as { kind: string }).kind as never)
  );
}

export class CameraShare {
  private pc: RTCPeerConnection;
  private onRemoteCb: ((stream: MediaStream) => void) | null = null;

  constructor(
    private readonly signaling: SignalingClient,
    private readonly isInitiator: boolean
  ) {
    this.pc = new RTCPeerConnection(RTC_CONFIG);

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.signal({ kind: "ice", candidate: ev.candidate.toJSON() });
      }
    };
    this.pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) this.onRemoteCb?.(stream);
    };

    this.signaling.onSignal((payload: SignalPayload) => {
      if (isSignalMsg(payload)) void this.handleSignal(payload);
    });
    // 상대가 (뒤늦게) 들어오면 initiator가 협상을 시작한다.
    this.signaling.onPeerJoined(() => {
      if (this.isInitiator) void this.makeOffer();
    });
  }

  onRemoteStream(cb: (stream: MediaStream) => void): void {
    this.onRemoteCb = cb;
  }

  // 로컬 웹캠 트랙을 추가한다. 상대가 이미 방에 있으면 initiator는 즉시 offer.
  async start(localStream: MediaStream, peerAlreadyPresent: boolean): Promise<void> {
    for (const track of localStream.getVideoTracks()) {
      const sender = this.pc.addTrack(track, localStream);
      await this.limitOutgoing(sender);
    }
    if (this.isInitiator && peerAlreadyPresent) await this.makeOffer();
  }

  // 전송 영상에 적당한 상한을 둔다(대역폭 위생용).
  // 성능 문제는 수신측 렌더 방식(캔버스 텍스처)에서 해결하므로, 여기선 화질을 크게 깎지 않는다.
  // 타일이 작아 초고화질은 불필요하지만, 부드럽게 보일 정도(30fps)는 유지한다.
  // 로컬 카메라 트랙 자체는 건드리지 않으므로 MediaPipe 포즈 인식엔 영향 없음.
  private async limitOutgoing(sender: RTCRtpSender): Promise<void> {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 700_000; // ~700 kbps
    params.encodings[0].maxFramerate = 30;
    params.encodings[0].scaleResolutionDownBy = 1.5; // 640x480 → ~427x320 (전송분만)
    try {
      await sender.setParameters(params);
    } catch {
      // 일부 브라우저는 일부 파라미터를 무시할 수 있다(치명적이지 않음).
    }
  }

  private async makeOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.signal({ kind: "offer", sdp: offer });
  }

  private async handleSignal(msg: SignalMsg): Promise<void> {
    if (msg.kind === "offer") {
      await this.pc.setRemoteDescription(msg.sdp);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signaling.signal({ kind: "answer", sdp: answer });
    } else if (msg.kind === "answer") {
      await this.pc.setRemoteDescription(msg.sdp);
    } else if (msg.kind === "ice") {
      try {
        await this.pc.addIceCandidate(msg.candidate);
      } catch {
        // 협상 타이밍상 일부 후보는 무시될 수 있다.
      }
    }
  }

  stop(): void {
    this.pc.close();
  }
}
