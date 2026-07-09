// WebRTC 카메라 공유 로컬 스모크 테스트 (Supabase/게임 없이 격리 검증).
// 두 탭으로 열어 확인:
//   http://localhost:5173/webrtc-test.html?role=host
//   http://localhost:5173/webrtc-test.html?role=guest
// (같은 room이면 됨. 한 대에서 두 탭이면 양쪽에 같은 웹캠이 보이면 P2P 정상)
import { SignalingClient } from "./SignalingClient";
import { CameraShare } from "./CameraShare";
import { VideoOverlay } from "./VideoOverlay";

const params = new URLSearchParams(location.search);
const room = params.get("room") ?? "smoke";
const role = params.get("role") ?? "host";
const isHost = role === "host";
const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || "ws://localhost:8787";

function log(msg: string): void {
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
  console.log("[smoke]", msg);
}

async function main(): Promise<void> {
  log(`room=${room} role=${role} signal=${SIGNAL_URL}`);

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  log("웹캠 확보");

  const local = new VideoOverlay({ id: "cam-local", corner: "right", label: `나(${role})`, mirror: true });
  local.setStream(stream);
  const remote = new VideoOverlay({ id: "cam-remote", corner: "left", label: "상대", mirror: false });

  const signaling = new SignalingClient(SIGNAL_URL, room);
  const share = new CameraShare(signaling, isHost);
  share.onRemoteStream((s) => {
    log("✅ 원격 스트림 수신 — 상대 카메라 표시");
    remote.setStream(s);
  });
  signaling.onPeerLeft(() => log("상대 나감"));

  const { peerPresent } = await signaling.connect();
  log(`시그널링 연결됨. peerPresent=${peerPresent}`);
  await share.start(stream, peerPresent);
  log(isHost ? "트랙 추가 (상대 있으면 offer 전송)" : "트랙 추가, offer 대기");
}

main().catch((e) => log("에러: " + (e instanceof Error ? e.message : String(e))));
