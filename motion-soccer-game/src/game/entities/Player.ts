import Phaser from "phaser";
import type { InputState } from "../../input/InputState";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
} from "../../config";

const PLAYER_TEXTURE = "player";

// 캐릭터: InputState를 받아 좌우 이동·점프를 수행한다.
// 입력 출처(키보드/모션)는 알지 못한다 — InputState만 신뢰한다.
export class Player {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly startX: number;
  private readonly startY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.startX = x;
    this.startY = y;

    if (!scene.textures.exists(PLAYER_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(PLAYER_COLOR, 1);
      g.fillRoundedRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT, 8);
      g.generateTexture(PLAYER_TEXTURE, PLAYER_WIDTH, PLAYER_HEIGHT);
      g.destroy();
    }

    this.sprite = scene.physics.add.image(x, y, PLAYER_TEXTURE);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setBounce(0);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(1600); // 낙하 속도 상한
  }

  update(input: InputState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (input.moveLeft) {
      this.sprite.setVelocityX(-PLAYER_SPEED);
    } else if (input.moveRight) {
      this.sprite.setVelocityX(PLAYER_SPEED);
    } else {
      this.sprite.setVelocityX(0);
    }

    // 바닥에 닿아 있을 때만 점프
    if (input.jump && body.blocked.down) {
      this.sprite.setVelocityY(PLAYER_JUMP_VELOCITY);
    }
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
  }
}
