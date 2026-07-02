import Phaser from "phaser";
import { GOAL_WIDTH, GOAL_HEIGHT, GOAL_POST_COLOR } from "../../config";

export type GoalSide = "left" | "right";

// 골대: 필드 양 끝에 위치. 공이 골 영역(zone)에 들어오면 득점 판정.
// zone은 정적 아케이드 바디로, 공과 overlap을 통해 감지한다.
export class Goal {
  public readonly side: GoalSide;
  public readonly zone: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene, side: GoalSide, worldWidth: number, groundTop: number) {
    this.side = side;

    const half = GOAL_WIDTH / 2;
    const x = side === "left" ? half : worldWidth - half;
    const centerY = groundTop - GOAL_HEIGHT / 2;

    // 감지 영역(정적 바디)
    this.zone = scene.add.zone(x, centerY, GOAL_WIDTH, GOAL_HEIGHT);
    scene.physics.add.existing(this.zone, true);

    this.draw(scene, x, groundTop);
  }

  private draw(scene: Phaser.Scene, x: number, groundTop: number): void {
    const half = GOAL_WIDTH / 2;
    const top = groundTop - GOAL_HEIGHT;
    const dir = this.side === "left" ? 1 : -1; // 필드 안쪽 방향

    const g = scene.add.graphics();

    // 골 영역 반투명 채움
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(x - half, top, GOAL_WIDTH, GOAL_HEIGHT);

    // 네트(그물) 격자
    g.lineStyle(1, 0xffffff, 0.22);
    for (let i = 1; i < 6; i++) {
      const gx = x - half + (GOAL_WIDTH / 6) * i;
      g.lineBetween(gx, top, gx, groundTop);
    }
    for (let j = 1; j < 6; j++) {
      const gy = top + (GOAL_HEIGHT / 6) * j;
      g.lineBetween(x - half, gy, x + half, gy);
    }

    // 골포스트(안쪽 기둥) + 크로스바
    const innerX = x + dir * half;
    const outerX = x - dir * half;
    g.lineStyle(6, GOAL_POST_COLOR, 1);
    g.beginPath();
    g.moveTo(innerX, groundTop);
    g.lineTo(innerX, top);
    g.lineTo(outerX, top);
    g.strokePath();
  }
}
