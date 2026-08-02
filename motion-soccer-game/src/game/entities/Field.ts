import Phaser from "phaser";
import {
  WORLD_WIDTH,
  GAME_HEIGHT,
  GROUND_HEIGHT,
  GROUND_COLOR,
} from "../../config";

const GROUND_TEXTURE = "ground";

// 필드: 월드 전체 폭의 바닥(정적 바디)과 배경 마커를 담당한다.
// 월드는 뷰포트보다 넓어 카메라가 좌우로 스크롤한다. 좌우/상단 벽은 월드 경계.
export class Field {
  public readonly ground: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene) {
    const groundTop = GAME_HEIGHT - GROUND_HEIGHT;
    const groundCenterY = GAME_HEIGHT - GROUND_HEIGHT / 2;

    // 스타디움 배경: 뷰포트에 고정하지 않고 월드 전체 폭(WORLD_WIDTH)에 걸쳐 깐다.
    // 그라운드/캐릭터와 같은 좌표계(scrollFactor 기본값 1)로 스크롤되므로, 카메라가
    // 공을 따라 좌우로 움직이면 이미지의 다른 부분이 자연스럽게 드러난다(고정 배경일 때는
    // 어디서든 같은 그림이라 실제로 이동하는 느낌이 안 났음).
    // 원본 종횡비를 유지한 채 가로만 WORLD_WIDTH에 맞추고, 세로는 그만큼 커져 뷰포트
    // 위로 넘치게 두되(하늘 쪽이라 잘려도 티 안 남) 바닥(잔디) 쪽을 화면 하단에 고정한다.
    // offsetY(123)는 슬라이더로 실험해 하늘이 적당히 보이도록 찾은 값.
    const STADIUM_OFFSET_Y = 123;
    const stadiumBg = scene.add
      .image(WORLD_WIDTH / 2, GAME_HEIGHT + STADIUM_OFFSET_Y, "stadium-daytime")
      .setOrigin(0.5, 1)
      .setDepth(-10);
    const stadiumHeight = WORLD_WIDTH * (stadiumBg.height / stadiumBg.width);
    stadiumBg.setDisplaySize(WORLD_WIDTH, stadiumHeight);

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
      groundCenterY,
      GROUND_TEXTURE,
    );
    this.ground.setVisible(false); // 충돌 전용 — 실제로 보이는 잔디는 스타디움 배경 그림 자체
  }
}
