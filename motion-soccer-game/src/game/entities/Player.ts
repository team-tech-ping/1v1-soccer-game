import Phaser from "phaser";
import type { InputState } from "../../input/InputState";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
} from "../../config";

// 캐릭터: InputState를 받아 좌우 이동·점프를 수행한다.
// 입력 출처(키보드/모션/네트워크)는 알지 못한다 — InputState만 신뢰한다.
export class Player {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly startX: number;
  private readonly startY: number;
  private _facing = 1; // -1: 왼쪽, 1: 오른쪽

  constructor(scene: Phaser.Scene, x: number, y: number, color: number = PLAYER_COLOR) {
    this.startX = x;
    this.startY = y;

    const texKey = `player-${color.toString(16)}`;
    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1);
      g.fillRoundedRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT, 8);
      g.generateTexture(texKey, PLAYER_WIDTH, PLAYER_HEIGHT);
      g.destroy();
    }

    this.sprite = scene.physics.add.image(x, y, texKey);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setBounce(0);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(1600); // 낙하 속도 상한
  }

  get facing(): number {
    return this._facing;
  }

  update(input: InputState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (input.moveLeft) {
      this.sprite.setVelocityX(-PLAYER_SPEED);
      this._facing = -1;
    } else if (input.moveRight) {
      this.sprite.setVelocityX(PLAYER_SPEED);
      this._facing = 1;
    } else {
      this.sprite.setVelocityX(0);
    }

    if (input.jump && body.blocked.down) {
      this.sprite.setVelocityY(PLAYER_JUMP_VELOCITY);
    }
  }

  // guest 렌더용: host 스냅샷의 위치/속도를 직접 반영(물리 시뮬 없이).
  applyState(x: number, y: number, vx: number, vy: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setVelocity(vx, vy);
    if (vx < -1) this._facing = -1;
    else if (vx > 1) this._facing = 1;
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
  }
}
