import Phaser from "phaser";
import {
  BALL_RADIUS,
  BALL_COLOR,
  BALL_BOUNCE,
  BALL_DRAG_X,
  BALL_MASS,
  BALL_KICK_LIFT,
  BALL_MIN_KICK_SPEED,
  BALL_KICK_COOLDOWN_MS,
  BALL_MAX_VELOCITY_X,
  BALL_MAX_VELOCITY_Y,
  HEAD_POWER_SCALE,
} from "../../config";

const BALL_TEXTURE = "ball";

// 공: 원형 물리 바디. 캐릭터·벽과 충돌해 튀고 굴러간다.
export class Ball {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly startX: number;
  private readonly startY: number;
  private lastKickAt = 0; // 마지막 킥 시각(ms) — 접촉 중 재발동 방지

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.startX = x;
    this.startY = y;

    if (!scene.textures.exists(BALL_TEXTURE)) {
      const d = BALL_RADIUS * 2;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(BALL_COLOR, 1);
      g.fillCircle(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
      g.lineStyle(3, 0x1d3557, 1);
      g.strokeCircle(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS - 1);
      g.generateTexture(BALL_TEXTURE, d, d);
      g.destroy();
    }

    this.sprite = scene.physics.add.image(x, y, BALL_TEXTURE);
    this.sprite.setCircle(BALL_RADIUS);
    this.sprite.setBounce(BALL_BOUNCE);
    this.sprite.setCollideWorldBounds(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setDragX(BALL_DRAG_X);
    body.setMass(BALL_MASS);
    // 연속 킥/헤딩으로 속도가 무한정 커지는 것을 막는다(물리 스텝당 이동거리를
    // 충돌 판정 크기 이내로 유지 — 캐릭터를 뚫고 지나가는 터널링 방지).
    body.setMaxVelocity(BALL_MAX_VELOCITY_X, BALL_MAX_VELOCITY_Y);
  }

  // 플레이어와 부딪히면 플레이어 반대 방향으로 튕겨내며 포물선을 그리게 한다.
  // 플레이어가 dynamic 바디라 공의 운동량을 흡수하는 문제를 피하기 위해,
  // 충돌 순간 공의 나가는 속도를 직접 계산해 덮어쓴다.
  //  - 굴러온 공: 들어온 속도 × 반발만큼 반사
  //  - 차는 경우: 플레이어 속도를 반영
  //  - 항상 최소 발사 속도 보장 + 위쪽 속도로 포물선
  kick(playerX: number, playerVelocityX: number): void {
    if (!this.canStrike()) return;
    const { dir, outSpeed } = this.computeStrike(playerX, playerVelocityX);
    this.sprite.setVelocityX(dir * outSpeed);
    this.sprite.setVelocityY(-BALL_KICK_LIFT);
  }

  // 머리 타격(헤딩). 몸통 킥과 같은 계산에 HEAD_POWER_SCALE을 곱해 더 약하게 만든다
  // (헤딩이 몸통 킥만큼 강하면 과하다는 피드백 반영).
  head(playerX: number, playerVelocityX: number): void {
    if (!this.canStrike()) return;
    const { dir, outSpeed } = this.computeStrike(playerX, playerVelocityX);
    this.sprite.setVelocityX(dir * outSpeed * HEAD_POWER_SCALE);
    this.sprite.setVelocityY(-BALL_KICK_LIFT * HEAD_POWER_SCALE);
  }

  // 접촉 중 재발동 방지 쿨다운. 통과하면 true를 반환하며 타이머를 갱신한다.
  private canStrike(): boolean {
    const scene = this.sprite.scene;
    if (scene.time.now - this.lastKickAt < BALL_KICK_COOLDOWN_MS) return false;
    this.lastKickAt = scene.time.now;
    return true;
  }

  private computeStrike(playerX: number, playerVelocityX: number): { dir: number; outSpeed: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const dir = this.sprite.x >= playerX ? 1 : -1; // 플레이어에서 공으로 향하는 방향
    const incomingSpeed = Math.abs(body.velocity.x);
    const outSpeed = Math.max(
      incomingSpeed * BALL_BOUNCE,
      Math.abs(playerVelocityX),
      BALL_MIN_KICK_SPEED
    );
    return { dir, outSpeed };
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
    this.sprite.setAngularVelocity(0);
  }
}
