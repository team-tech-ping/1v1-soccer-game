import Phaser from "phaser";
import {
  BALL_RADIUS,
  BALL_BOUNCE,
  BALL_DRAG_X,
  BALL_MASS,
  BALL_KICK_LIFT,
  BALL_MIN_KICK_SPEED,
  BALL_KICK_COOLDOWN_MS,
  BALL_MAX_VELOCITY_X,
  BALL_MAX_VELOCITY_Y,
  BALL_STOMP_SPEED,
  BALL_STOMP_LIFT,
  BALL_GROUND_MAX_SPEED,
  HEAD_POWER_SCALE,
  PLAYER_WIDTH,
} from "../../config";

const BALL_TEXTURE = "soccer-ball";

// 공: 원형 물리 바디. 캐릭터·벽과 충돌해 튀고 굴러간다.
export class Ball {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly startX: number;
  private readonly startY: number;
  private lastKickAt = 0; // 마지막 킥 시각(ms) — 접촉 중 재발동 방지

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.startX = x;
    this.startY = y;

    this.sprite = scene.physics.add.image(x, y, BALL_TEXTURE);
    // 화면 표시 크기를 BALL_RADIUS 기준으로 맞춘 뒤, 원본 텍스처의 절반 크기를
    // 로컬(스케일 이전) 반지름으로 지정한다. Arcade의 원형 바디는 오브젝트의
    // scale이 곱해진 채 적용되므로, 이 둘의 비율이 항상 BALL_RADIUS로 상쇄된다
    // (텍스처 크기와 무관하게 안전 — Player 히트박스에서 겪었던 스케일 결합 문제 방지).
    const diameter = BALL_RADIUS * 2;
    this.sprite.setDisplaySize(diameter, diameter);
    this.sprite.setCircle(this.sprite.width / 2);
    this.sprite.setBounce(BALL_BOUNCE);
    this.sprite.setCollideWorldBounds(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setDragX(BALL_DRAG_X);
    body.setMass(BALL_MASS);
    // 연속 킥/헤딩으로 속도가 무한정 커지는 것을 막는다(물리 스텝당 이동거리를
    // 충돌 판정 크기 이내로 유지 — 캐릭터를 뚫고 지나가는 터널링 방지).
    body.setMaxVelocity(BALL_MAX_VELOCITY_X, BALL_MAX_VELOCITY_Y);
  }

  // 굴러가는 시각 효과: 수평 속도만큼 매 프레임 회전시킨다(미끄러짐 없는 굴림 근사,
  // 각속도 = 선속도 / 반지름). host/guest/local 어느 쪽이든 스프라이트 속도 기준으로
  // 계산하므로 물리 권위와 무관하게 항상 자연스럽게 굴러 보인다.
  update(delta: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.sprite.rotation += (body.velocity.x * (delta / 1000)) / BALL_RADIUS;
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

  // 플레이어가 공 위에 올라타려 할 때(위에서 히트): 공이 발판이 되지 못하도록 즉시
  // 발밑 밖으로 위치를 옮기고 옆으로 튕겨낸다. '절대 올라타지 못하게' 매 프레임 호출될
  // 수 있으므로 쿨다운으로 막지 않는다(막으면 그 사이 공 위에 얹힐 수 있음).
  stomp(playerX: number): void {
    const dir = this.sprite.x >= playerX ? 1 : -1;
    const escapeGap = PLAYER_WIDTH / 2 + BALL_RADIUS + 8;
    this.sprite.setPosition(playerX + dir * escapeGap, this.sprite.y);
    this.sprite.setVelocityX(dir * BALL_STOMP_SPEED);
    this.sprite.setVelocityY(-BALL_STOMP_LIFT);
  }

  // 바닥에서 구를 때 수평 속도를 상한으로 눌러 캐릭터가 따라잡을 수 있게 한다.
  // (공중 킥 속도에는 영향 없음 — 바닥에 닿아 있을 때만.)
  capGroundSpeed(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down && Math.abs(body.velocity.x) > BALL_GROUND_MAX_SPEED) {
      this.sprite.setVelocityX(Math.sign(body.velocity.x) * BALL_GROUND_MAX_SPEED);
    }
  }

  // 접촉 중 재발동 방지 쿨다운. 통과하면 true를 반환하며 타이머를 갱신한다.
  private canStrike(): boolean {
    const scene = this.sprite.scene;
    if (scene.time.now - this.lastKickAt < BALL_KICK_COOLDOWN_MS) return false;
    this.lastKickAt = scene.time.now;
    return true;
  }

  private computeStrike(
    playerX: number,
    playerVelocityX: number,
  ): { dir: number; outSpeed: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const dir = this.sprite.x >= playerX ? 1 : -1; // 플레이어에서 공으로 향하는 방향
    const incomingSpeed = Math.abs(body.velocity.x);
    const outSpeed = Math.max(
      incomingSpeed * BALL_BOUNCE,
      Math.abs(playerVelocityX),
      BALL_MIN_KICK_SPEED,
    );
    return { dir, outSpeed };
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
    this.sprite.rotation = 0;
  }
}
