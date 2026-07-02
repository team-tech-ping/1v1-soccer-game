import Phaser from "phaser";
import { WORLD_WIDTH, GAME_HEIGHT, GROUND_HEIGHT, GROUND_COLOR } from "../../config";

const GROUND_TEXTURE = "ground";

// 필드: 월드 전체 폭의 바닥(정적 바디)과 배경 마커를 담당한다.
// 월드는 뷰포트보다 넓어 카메라가 좌우로 스크롤한다. 좌우/상단 벽은 월드 경계.
export class Field {
  public readonly ground: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene) {
    const groundTop = GAME_HEIGHT - GROUND_HEIGHT;

    // 배경 마커: 스크롤이 눈에 보이도록 세로 줄과 중앙선을 그린다.
    const deco = scene.add.graphics();
    deco.lineStyle(2, 0xffffff, 0.05);
    for (let x = 240; x < WORLD_WIDTH; x += 240) {
      deco.lineBetween(x, 0, x, groundTop);
    }
    deco.lineStyle(3, 0xffffff, 0.14);
    deco.lineBetween(WORLD_WIDTH / 2, 0, WORLD_WIDTH / 2, groundTop);
    deco.setDepth(-1);

    if (!scene.textures.exists(GROUND_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(GROUND_COLOR, 1);
      g.fillRect(0, 0, WORLD_WIDTH, GROUND_HEIGHT);
      g.generateTexture(GROUND_TEXTURE, WORLD_WIDTH, GROUND_HEIGHT);
      g.destroy();
    }

    this.ground = scene.physics.add.staticImage(
      WORLD_WIDTH / 2,
      GAME_HEIGHT - GROUND_HEIGHT / 2,
      GROUND_TEXTURE
    );
  }
}
