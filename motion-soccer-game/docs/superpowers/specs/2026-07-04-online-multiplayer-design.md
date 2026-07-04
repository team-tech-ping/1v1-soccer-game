# 온라인 1v1 멀티플레이어 설계 (Host-authoritative relay over Supabase Realtime)

- **날짜**: 2026-07-04
- **대상**: 모션 인식 웹 2D 축구 게임 (MVP → 온라인 1v1)
- **관련 명세**: 기능명세서 §3 (웹 기반 멀티플레이어 매칭), §5.1 (홈 화면)

## 목표

기존 로컬 단일 플레이어 MVP를, 두 유저가 온라인에서 1v1로 대결하는 게임으로 확장한다.
이번 job의 매칭 범위는 **방 코드 / 초대 링크**까지이며, 빠른 매칭 큐는 후속 job으로 남긴다.

## 핵심 결정 (확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| Netcode 권한 모델 | **Host-authoritative relay** | "간단한 서버" 요구. 서버는 연산 없이 relay만. 캐주얼/친구전에 충분 |
| 전송 계층 | **Supabase Realtime Broadcast** | 서버 코드 0줄·서버리스·비용 최소. 방=채널, presence로 입장 감지 |
| 매칭 범위 | **방 코드 / 초대 링크만** | 가장 작고 확실한 다음 단계. 매칭 큐는 후속 |
| Guest side 배정 | **host=왼쪽, guest=오른쪽 고정** | MVP 단순화 |
| Netcode 품질 | **스냅샷 보간만 (예측/rollback 없음)** | MVP. 자기 입력 지연 체감 시 로컬 예측을 후속 추가 |
| 테스트 | **vitest 도입** | 현재 테스트 셋업 없음 |

## 아키텍처

### 역할 모델

- **Host**: 방 생성자. 기존 Phaser Arcade 시뮬을 그대로 권위 있게 실행한다.
  공·양 플레이어 위치·점수·경기 시계를 소유한다.
- **Guest**: thin client. host 스냅샷을 렌더만 하고, 자기 모션 입력을 host로 전송한다.
  host가 그 입력을 player2에 적용한다.
- **local**: 오프라인/개발용 단일 플레이어 모드 (기존 동작 유지).

`InputState` 추상화가 이 구조에 그대로 맞는다. guest 입력이 네트워크로 도착해
`player2.update(input)`에 들어가므로 게임 로직은 입력 출처를 모른다.

### 방 라이프사이클 (방 코드 / 초대 링크)

1. `HomeScene`: "방 만들기" / "코드 입장" (신설 시작 화면, 명세 §5.1)
2. Host → 4자 코드 생성 → Supabase 채널 `room:{code}` join → 초대 링크 `?room={code}` 생성
3. Guest → 링크 또는 코드로 같은 채널 join
4. **Presence**로 양쪽 입장 감지 → host가 `match_start` 이벤트 전송 → 양쪽 `PlayScene`을 role과 함께 시작
5. 끊김: presence leave → 게임 일시정지 + "상대 연결 끊김" 표시 (재연결은 최소한만 처리)

### 메시지 프로토콜

채널 1개 위에서 event 타입으로 구분한다.

- `guest_input` (guest→host, ~`INPUT_HZ`): `{ seq, moveLeft, moveRight, jump }`
- `snapshot` (host→guest, ~`SNAPSHOT_HZ`):
  `{ t, p1:{x,y,vx,vy,facing}, p2:{x,y,vx,vy,facing}, ball:{x,y,vx,vy}, scoreL, scoreR, clockMs, phase }`
- `event` (host→guest, 온디맨드): `matchStart` / `goal` / `matchEnd` / `pause` / `resume`

레이트 근사: 2분 경기 × 20Hz ≈ 매치당 스냅샷 2,400개. Supabase 프리 티어(월 200만 메시지)로 약 800매치 커버.
broadcast 레이트 제한이 병목이 되면 `SNAPSHOT_HZ`를 낮추거나 델타 인코딩을 후속 검토.

### Netcode 품질 (명세 §3.3.4)

- **Guest 렌더**: 스냅샷 2개 이상 버퍼링 → `INTERP_DELAY_MS`(~100ms) 과거 시점을 렌더하며 위치 lerp 보간.
  네트워크 jitter를 흡수한다. MVP는 rollback 없음.
- **Host**: 60fps 시뮬 유지. 로컬 플레이어=모션 입력, 원격 player2=가장 최근 guest 입력을 다음 입력 도착까지 유지.
- 자기 캐릭터 입력 지연이 체감되면 guest 로컬 예측(prediction)을 후속 job으로 추가. **MVP는 전체 보간만.**

### 카메라 / "내 캐릭터"

- 카메라는 기존대로 공을 따라간다 (양쪽 동일 월드 렌더).
- host 플레이어=왼쪽, guest 플레이어=오른쪽 고정.
- 모션은 항상 각자의 로컬에서 자기 플레이어를 구동한다.

### 경기 시계 · 승패 권위

- Host가 카운트다운을 소유한다 (명세 §2.3). snapshot의 `clockMs`로 전송, guest는 표시만.
- 경기 종료 시 host가 승자 계산 → `matchEnd` 이벤트 → 양쪽 결과 화면 표시.

## 모듈 경계

기존 스타일 유지 (MotionController가 MediaPipe를 감추듯, net 계층이 Supabase를 격리).

### 신규 파일

- `src/net/supabaseClient.ts` — Supabase client init + env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `src/net/NetChannel.ts` — Supabase 채널 래퍼 인터페이스: `send(event, payload)`, `on(event, cb)`, presence join/leave.
  게임 코드는 Supabase를 직접 모른다. **인터페이스화하여 테스트용 in-memory fake 주입 가능.**
- `src/net/RoomSession.ts` — 방 생성/입장, 코드 생성, presence 기반 준비 감지, role 배정, `match_start` handshake
- `src/net/protocol.ts` — 메시지 타입(`Snapshot`, `GuestInput`, `MatchEvent`) + 직렬화 헬퍼
- `src/net/Interpolator.ts` — 스냅샷 버퍼 + lerp 보간
- `src/game/scenes/HomeScene.ts` — 방 만들기/코드 입장 UI + 초대 링크 공유

### `PlayScene` 리팩터

- **플레이어 2명** 지원 (현재 1명): player1(왼쪽) + player2(오른쪽) 추가
- `role: 'host' | 'guest' | 'local'` 도입
- host: 물리 step 후 snapshot broadcast, 수신한 guest 입력을 player2에 적용
- guest: 원격 물리 억제, 매 프레임 보간된 스냅샷을 스프라이트에 적용, 로컬 입력 전송,
  점수/골은 host event로 미러
- 점수·시계·골 처리 로직을 분리(예: `MatchState`)하여 guest가 그대로 미러할 수 있게 함

### `config.ts` 추가 상수

- `SNAPSHOT_HZ` (예: 20)
- `INPUT_HZ` (예: 20~30)
- `INTERP_DELAY_MS` (예: 100)
- `ROOM_CODE_LENGTH` (예: 4)

### `main.ts`

- 씬 흐름을 `HomeScene → PlayScene`으로 연결. `?room=` 쿼리 파라미터 있으면 guest 자동 입장.

## 테스트 전략

netcode 테스트 용이성이 이 설계의 핵심 가치다.

- **순수 유닛 (vitest, 네트워크 없음)**:
  - `Interpolator` — 스냅샷 버퍼 lerp 정확성
  - `protocol` — 직렬화 roundtrip
  - 코드 생성 — 길이/문자셋/충돌
- **통합 (in-memory fake channel)**:
  - `NetChannel` 인터페이스에 in-memory 구현 주입 → host+guest를 한 프로세스에서 구동
  - guest 상태가 host 스냅샷으로 수렴하는지 검증 (Supabase 없이 동기화 로직 검증)
- **수동**: 브라우저 2탭 (host/guest) — 동기화·체감 지연·골/승패 확인

## 이번 job 범위 밖 (YAGNI)

- 빠른 매칭 큐 (§3.1) — 후속 job
- 아바타 / 필터 (§4), 플레이어 간 웹캠 영상 전송
- 치팅 방지, 스펙테이터
- DB 영속 / 전적 / 리더보드 — 후속 (Supabase Postgres 활용 가능)
- guest 로컬 예측 / rollback — 체감 지연 문제 시 후속

## 리스크

- **Supabase broadcast 레이트 제한**: `SNAPSHOT_HZ` 튜닝 또는 델타 인코딩으로 대응
- **relay 왕복 지연** (client→Supabase→client): 캐주얼 1v1엔 허용 범위, 보간으로 완화
- **host 이탈 시 경기 중단**: MVP는 경기 종료 처리. host 마이그레이션은 범위 밖
