import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR, GRAVITY_Y } from "./config";
import { HomeScene } from "./game/scenes/HomeScene";
import { PlayScene } from "./game/scenes/PlayScene";
import { ResultScene } from "./game/scenes/ResultScene";
import { MotionDebugScene } from "./game/scenes/MotionDebugScene";

// 진입점: Phaser 게임 인스턴스를 생성하고 부트한다.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
      // 기본 60Hz보다 촘촘한 물리 스텝 — 바디 수가 적어(플레이어2+공+머리 히트박스2)
      // 비용은 미미하지만, 빠른 충돌(킥·헤딩)에서 스텝당 이동거리를 줄여 터널링을 완화한다.
      fps: 120,
    },
  },
  // HomeScene(방 만들기/입장)이 배열 첫 항목으로 자동 시작된다.
  // MotionDebugScene은 단독 검증이 필요할 때 첫 항목으로 바꿔 사용.
  scene: [HomeScene, PlayScene, ResultScene, MotionDebugScene],
};

new Phaser.Game(config);
