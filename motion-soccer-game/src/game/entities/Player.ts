import Phaser from "phaser";
import type { InputState } from "../../input/InputState";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
  PLAYER_SPRITE_HEIGHT,
} from "../../config";

type Pose = "front" | "run" | "jump";
const RUN_FRAME_HOLD = 2; // update() 호출 몇 번마다 다음 러닝 프레임으로 넘어갈지

export interface PlayerTextureSet {
  front: string;
  jump: string;
  run: string[];
}

// 방장/참여자 전용 캐릭터(초록·주황 유니폼). front/jump/run 모두 이미 캐릭터별로
// 색이 입혀진 전용 그림이라(tint 불필요) 셋을 하나로 묶어 전달한다.
// run 순서는 Gemini로 생성한 원본 시트에 이미 자연스럽게 배치되어 있어 그대로 사용한다.
export const HOST_TEXTURES: PlayerTextureSet = {
  front: "player-host-front",
  jump: "player-host-jump",
  run: Array.from({ length: 8 }, (_, i) => `player-host-run-${i}`),
};
export const GUEST_TEXTURES: PlayerTextureSet = {
  front: "player-guest-front",
  jump: "player-guest-jump",
  run: Array.from({ length: 8 }, (_, i) => `player-guest-run-${i}`),
};

// 캐릭터: InputState를 받아 좌우 이동·점프를 수행한다.
// 입력 출처(키보드/모션/네트워크)는 알지 못한다 — InputState만 신뢰한다.
//
// 히트박스(sprite, 48x72 고정)와 실제로 보이는 유니폼 그림(visual)을 분리한다.
// player-front/run/jump 각 PNG는 크롭 원본 크기가 제각각이라, 이걸 그대로
// 물리 바디에 물리면 Arcade의 body-scale 커플링 때문에 히트박스가 텍스처 크기에
// 따라 같이 줄어들거나 늘어난다. sprite는 항상 안 보이는 상태로 충돌만 담당하고,
// visual은 매 프레임 sprite의 발밑(바닥) 위치에 맞춰 따라다니기만 한다.
export class Player {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly visual: Phaser.GameObjects.Image;
  private readonly startX: number;
  private readonly startY: number;
  private _facing = 1; // -1: 왼쪽, 1: 오른쪽
  private currentTexture: string | null = null;
  private runTick = 0;
  private readonly textures: PlayerTextureSet;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    color: number = PLAYER_COLOR,
    textures: PlayerTextureSet = HOST_TEXTURES,
  ) {
    this.startX = x;
    this.startY = y;
    this.textures = textures;

    const texKey = `player-hitbox-${color.toString(16)}`;
    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1);
      g.fillRoundedRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT, 8);
      g.generateTexture(texKey, PLAYER_WIDTH, PLAYER_HEIGHT);
      g.destroy();
    }

    this.sprite = scene.physics.add.image(x, y, texKey);
    this.sprite.setVisible(false); // 충돌 전용, 화면엔 visual만 보인다
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setBounce(0);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(1600); // 낙하 속도 상한

    this.visual = scene.add.image(x, y, textures.front);
    this.visual.setOrigin(0.5, 1); // 발 기준 앵커 — 포즈별 그림 높이가 달라도 발 위치는 고정
    this.setTexture(textures.front);
    this.syncVisual();
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

    this.updateVisual(!body.blocked.down);
  }

  // guest 렌더용: host 스냅샷의 위치/속도를 직접 반영(물리 시뮬 없이).
  applyState(x: number, y: number, vx: number, vy: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setVelocity(vx, vy);
    if (vx < -1) this._facing = -1;
    else if (vx > 1) this._facing = 1;

    // 스냅샷엔 접지 여부가 없어 수직 속도로 공중 상태를 근사한다.
    this.updateVisual(Math.abs(vy) > 40);
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
    this.updateVisual(false);
  }

  private updateVisual(airborne: boolean): void {
    const moving = this.sprite.body!.velocity.x !== 0;
    const next: Pose = airborne ? "jump" : moving ? "run" : "front";
    if (next !== "run") this.runTick = 0; // 다음에 뛸 때 항상 첫 프레임부터 시작

    this.setTexture(this.textureFor(next));
    if (next === "run") this.runTick++;

    this.visual.setFlipX(this._facing === -1);
    this.syncVisual();
  }

  private textureFor(pose: Pose): string {
    if (pose === "front") return this.textures.front;
    if (pose === "jump") return this.textures.jump;
    const run = this.textures.run;
    return run[Math.floor(this.runTick / RUN_FRAME_HOLD) % run.length];
  }

  private setTexture(key: string): void {
    if (this.currentTexture === key) return;
    this.currentTexture = key;
    this.visual.setTexture(key);
    const { width, height } = this.visual;
    this.visual.setDisplaySize(
      (PLAYER_SPRITE_HEIGHT * width) / height,
      PLAYER_SPRITE_HEIGHT,
    );
  }

  // 히트박스(sprite)의 발밑(하단 중앙)에 visual의 앵커를 맞춘다.
  private syncVisual(): void {
    this.visual.setPosition(this.sprite.x, this.sprite.y + PLAYER_HEIGHT / 2);
  }
}
