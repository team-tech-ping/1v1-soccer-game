# signaling-server

WebRTC 카메라 공유용 **시그널링 서버**. 방(room code)에 들어온 두 클라이언트 사이에서
WebRTC 핸드셰이크(offer/answer/ICE)만 중계한다. **영상은 이 서버를 지나지 않고**
브라우저↔브라우저(P2P)로 직접 흐른다.

## 로컬 실행

```bash
cd server
npm install
npm start        # 기본 포트 8787 (PORT 환경변수로 변경 가능)
npm test         # 방 관리/중계 테스트
```

- `GET /` → `signaling ok` (헬스체크)
- ws 프로토콜:
  - C→S `{ "t": "join", "room": "<code>" }`
  - C→S `{ "t": "signal", "payload": <any> }` → 같은 방 상대에게 `{ "t":"signal", "payload" }`로 중계
  - S→C `{ "t":"joined", "count" }` / `{ "t":"peer-joined", "count" }` / `{ "t":"peer-left", "count" }` / `{ "t":"error", "reason":"full" }`

## Railway 배포

- **Root Directory**: `server`
- **Build**: 자동(`npm install`)
- **Start Command**: `npm start`
- 포트: Railway가 `PORT`를 주입 → 코드가 자동 사용
- 배포 후 공개 도메인(`https://<app>.up.railway.app`)이 생기며, 클라이언트는
  `wss://<app>.up.railway.app` 로 접속(프론트 환경변수 `VITE_SIGNAL_URL`).
- 프론트(Cloudflare)와 별도 서비스로, 서로 다른 Root Directory라 한 레포에서 공존한다.
