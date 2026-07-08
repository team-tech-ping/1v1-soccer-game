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
    for (const track of localStream.getTracks()) {
      this.pc.addTrack(track, localStream);
    }
    if (this.isInitiator && peerAlreadyPresent) await this.makeOffer();
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
