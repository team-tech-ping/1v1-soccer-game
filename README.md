# 1v1 Soccer Game — 모션 인식 웹 2D 축구 게임

웹캠 모션 인식으로 캐릭터를 조작하는 2D 축구 게임. 고개를 좌우로 움직여 이동하고, 위로 들어 점프하며 공을 굴려 양 끝 골대에 넣습니다.

## 기술 스택

- **TypeScript + Vite**
- **Phaser 3** (Arcade 물리)
- **MediaPipe Tasks Vision** (PoseLandmarker)

## 실행

```bash
cd motion-soccer-game
npm install
npm run dev
```

브라우저에서 열고 카메라 권한을 허용한 뒤, `C`로 정면 보정 → 고개를 좌우로 움직이거나 위로 들어 캐릭터를 조작합니다. 카메라를 못 쓰면 키보드(← → ↑)로 폴백됩니다.

## 조작

| 동작 | 모션 | 키보드 |
| --- | --- | --- |
| 좌/우 이동 | 고개를 좌/우로 | ← / → |
| 점프 | 코를 위로 | ↑ |
| 정면 보정 | — | C |
| 공 리셋 | — | R |

## 구조

```
motion-soccer-game/src/
  config.ts              # 화면·물리·필드·골대 상수
  main.ts                # Phaser 진입점
  input/InputState.ts    # 입력 추상화(모션/키보드 공용)
  game/entities/         # Field, Player, Ball, Goal
  game/scenes/           # PlayScene, MotionDebugScene, BootScene
  motion/                # CameraSource, PoseDetector, MotionMapper, MotionController
docs/                    # MVP 개발 문서
```

## 게임 규칙 (현재 MVP)

- 필드는 뷰포트의 3배 폭. 공이 가장자리로 가면 카메라가 따라 스크롤.
- 공을 양 끝 골대에 넣으면 해당 쪽 스코어 +1, 공·플레이어·카메라가 중앙으로 리셋.
