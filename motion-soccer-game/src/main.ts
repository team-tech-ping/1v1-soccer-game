import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR, GRAVITY_Y } from "./config";
import { PlayScene } from "./game/scenes/PlayScene";
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
    },
  },
  // 3단계: 모션으로 구동되는 PlayScene을 시작한다. (배열 첫 씬이 자동 시작)
  // MotionDebugScene은 단독 검증이 필요할 때 첫 항목으로 바꿔 사용.
  // (Boot → Home → Play 흐름 연결은 4단계에서 처리)
  scene: [PlayScene, MotionDebugScene],
};

new Phaser.Game(config);
