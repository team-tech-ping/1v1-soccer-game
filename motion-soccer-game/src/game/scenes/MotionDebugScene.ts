import Phaser from "phaser";
import { GAME_WIDTH } from "../../config";
import { MotionController } from "../../motion/MotionController";

// 모션 인식 단독 검증용 디버그 화면. (PlayScene과 동일한 MotionController 사용)
// main.ts의 scene 배열 첫 항목을 이 씬으로 바꾸면 단독 검증할 수 있다.
export class MotionDebugScene extends Phaser.Scene {
  private motion = new MotionController();

  private statusText!: Phaser.GameObjects.Text;
  private latencyText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private leftInd!: Phaser.GameObjects.Text;
  private rightInd!: Phaser.GameObjects.Text;
  private jumpInd!: Phaser.GameObjects.Text;
  private jumpFlashUntil = 0;

  constructor() {
    super("MotionDebug");
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, 20, "모션 인식 디버그", {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#e0e1dd",
      })
      .setOrigin(0.5, 0);

    this.statusText = this.add.text(24, 70, "CAMERA: 초기화 중...", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffd166",
    });
    this.latencyText = this.add.text(24, 100, "latency: -- ms", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#a8dadc",
    });
    this.valueText = this.add.text(24, 130, "offsetX: --  riseY: --", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#a8dadc",
    });

    this.leftInd = this.makeIndicator(GAME_WIDTH / 2 - 220, 280, "◀ LEFT");
    this.rightInd = this.makeIndicator(GAME_WIDTH / 2 + 60, 280, "RIGHT ▶");
    this.jumpInd = this.makeIndicator(GAME_WIDTH / 2 - 80, 380, "▲ JUMP");

    this.add
      .text(GAME_WIDTH / 2, 470, "C: 중립 자세 보정(캘리브레이션)", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#778da9",
      })
      .setOrigin(0.5, 0);

    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C).on("down", () => {
      this.motion.calibrate();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.motion.stop());
    void this.boot();
  }

  private async boot(): Promise<void> {
    await this.motion.start();
    if (this.motion.ready) {
      this.motion.attachPreview();
      this.statusText.setText("READY · 고개를 좌우로 움직이거나 점프").setColor("#90ee90");
    } else {
      this.statusText.setText(`오류: ${this.motion.error}`).setColor("#ff6b6b");
    }
  }

  update(): void {
    if (!this.motion.ready) return;

    const now = performance.now();
    const input = this.motion.poll(now);
    const debug = this.motion.debug;

    this.latencyText.setText(`latency: ${this.motion.latencyMs.toFixed(1)} ms`);
    if (debug.detected) {
      this.valueText.setText(
        `offsetX: ${debug.offsetX.toFixed(3)}  riseY: ${debug.riseY.toFixed(3)}`
      );
    } else {
      this.valueText.setText("offsetX: --  riseY: --  (사람 미감지)");
    }

    this.setIndicator(this.leftInd, input.moveLeft);
    this.setIndicator(this.rightInd, input.moveRight);
    if (input.jump) this.jumpFlashUntil = now + 250;
    this.setIndicator(this.jumpInd, now < this.jumpFlashUntil);
  }

  private makeIndicator(x: number, y: number, label: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: "sans-serif",
        fontSize: "32px",
        color: "#415a77",
        backgroundColor: "#1b263b",
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0, 0);
  }

  private setIndicator(ind: Phaser.GameObjects.Text, active: boolean): void {
    ind.setColor(active ? "#06d6a0" : "#415a77");
  }
}
