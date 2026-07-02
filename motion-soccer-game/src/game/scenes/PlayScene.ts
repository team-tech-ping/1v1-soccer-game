import Phaser from "phaser";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  WORLD_WIDTH,
  GROUND_HEIGHT,
  PLAYER_HEIGHT,
  GOAL_COOLDOWN_MS,
} from "../../config";
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import { Player } from "../entities/Player";
import { Goal, type GoalSide } from "../entities/Goal";
import { createEmptyInputState, type InputState } from "../../input/InputState";
import { MotionController } from "../../motion/MotionController";

// 3단계: 통합 + 넓은 필드/골대/스코어.
// - 월드가 뷰포트보다 넓어 카메라가 공을 따라 좌우로 스크롤한다.
// - 양 끝 골대에 공이 들어가면 해당 스코어가 오른다.
// - 캐릭터 입력은 모션으로 구동하고, 카메라 못 쓰면 키보드로 폴백.
export class PlayScene extends Phaser.Scene {
  private field!: Field;
  private ball!: Ball;
  private player!: Player;
  private goals: Goal[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private resetKey!: Phaser.Input.Keyboard.Key;

  private motion = new MotionController();
  private statusText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  private scoreLeft = 0;
  private scoreRight = 0;
  private lastGoalAt = 0;

  constructor() {
    super("Play");
  }

  create(): void {
    const groundTop = GAME_HEIGHT - GROUND_HEIGHT;

    // 물리 월드 경계의 바닥을 '바닥 윗면'에 맞춘다.
    // collider는 프레임 끊김(모션 추론)으로 delta가 커지면 바닥을 통과(터널링)할 수 있지만,
    // 월드 경계는 적분 후 위치를 강제로 clamp하므로 절대 뚫리지 않는다.
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, groundTop);

    this.field = new Field(this);
    this.player = new Player(this, WORLD_WIDTH * 0.5 - 120, groundTop - PLAYER_HEIGHT);
    this.ball = new Ball(this, WORLD_WIDTH * 0.5, groundTop - 200);

    // 양 끝 골대
    this.goals = [
      new Goal(this, "left", WORLD_WIDTH, groundTop),
      new Goal(this, "right", WORLD_WIDTH, groundTop),
    ];

    // 충돌 설정
    this.physics.add.collider(this.player.sprite, this.field.ground);
    this.physics.add.collider(this.ball.sprite, this.field.ground);
    this.physics.add.collider(this.player.sprite, this.ball.sprite, () => {
      // 충돌 시 공을 플레이어 반대 방향으로 튕겨내며 포물선을 그리게 한다.
      const playerBody = this.player.sprite.body as Phaser.Physics.Arcade.Body;
      this.ball.kick(this.player.sprite.x, playerBody.velocity.x);
    });

    // 공이 골 영역에 들어오면 득점
    for (const goal of this.goals) {
      this.physics.add.overlap(this.ball.sprite, goal.zone, () => this.onGoal(goal.side));
    }

    // 카메라: 공을 따라가되 데드존 안에서는 고정 → 공이 가장자리로 가면 스크롤.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    cam.startFollow(this.ball.sprite, true, 0.1, 0.1);
    cam.setDeadzone(GAME_WIDTH * 0.5, GAME_HEIGHT);

    // 키보드: 폴백 이동 + 공 리셋(R) + 캘리브레이션(C)
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.resetKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C).on("down", () => {
      this.motion.calibrate();
    });

    // HUD: 카메라에 고정(스크롤 무시)
    this.statusText = this.add
      .text(24, 20, "모션: 초기화 중...", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#ffd166",
      })
      .setScrollFactor(0);

    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 14, "", {
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#e0e1dd",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.updateScoreboard();

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 26, "C: 정면 보정 · R: 공 리셋", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#778da9",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.motion.stop());

    // 모션 시작(비동기). 준비될 때까지는 키보드로 조작 가능.
    void this.startMotion();
  }

  private async startMotion(): Promise<void> {
    await this.motion.start();
    if (this.motion.ready) {
      this.motion.attachPreview();
    }
  }

  update(): void {
    const now = performance.now();
    const input = this.resolveInput(now);
    this.player.update(input);
    this.updateStatus();

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.ball.reset();
    }
  }

  // 공이 골 영역에 들어오면 해당 스코어를 올리고 공을 중앙으로 리셋.
  private onGoal(side: GoalSide): void {
    const now = this.time.now;
    if (now - this.lastGoalAt < GOAL_COOLDOWN_MS) return;
    this.lastGoalAt = now;

    if (side === "left") this.scoreLeft++;
    else this.scoreRight++;

    this.updateScoreboard();
    this.cameras.main.flash(200, 255, 255, 255);
    this.ball.reset();
    this.player.reset();
    // 데드존 때문에 공 리셋만으로는 카메라가 안 돌아오므로 중앙으로 즉시 이동.
    this.cameras.main.centerOn(WORLD_WIDTH / 2, GAME_HEIGHT / 2);
  }

  private updateScoreboard(): void {
    this.scoreText.setText(`◀ ${this.scoreLeft}   :   ${this.scoreRight} ▶`);
  }

  // 모션이 준비되면 모션 입력을, 아니면 키보드 입력을 사용한다.
  private resolveInput(now: number): InputState {
    if (this.motion.ready) {
      return this.motion.poll(now);
    }
    return this.readKeyboard();
  }

  private readKeyboard(): InputState {
    const input = createEmptyInputState();
    input.moveLeft = this.cursors.left.isDown;
    input.moveRight = this.cursors.right.isDown;
    input.jump = Phaser.Input.Keyboard.JustDown(this.cursors.up);
    return input;
  }

  private updateStatus(): void {
    switch (this.motion.state) {
      case "ready": {
        const d = this.motion.debug;
        this.statusText
          .setText(
            `모션 ON · ${this.motion.latencyMs.toFixed(0)}ms · ` +
              `offsetX ${d.offsetX.toFixed(2)} riseY ${d.riseY.toFixed(2)}`
          )
          .setColor("#90ee90");
        break;
      }
      case "loading":
        this.statusText.setText("모션: 로딩 중... (키보드로 조작 가능)").setColor("#ffd166");
        break;
      case "error":
        this.statusText
          .setText(`모션 OFF: ${this.motion.error} · 키보드(← → ↑)로 조작`)
          .setColor("#ff6b6b");
        break;
      default:
        this.statusText.setText("모션: 초기화 중...").setColor("#ffd166");
    }
  }
}
