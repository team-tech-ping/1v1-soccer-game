import Phaser from "phaser";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  WORLD_WIDTH,
  GROUND_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER2_COLOR,
  GOAL_COOLDOWN_MS,
  SNAPSHOT_HZ,
  INPUT_HZ,
} from "../../config";
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import { Player } from "../entities/Player";
import { Goal, type GoalSide } from "../entities/Goal";
import { createEmptyInputState, type InputState } from "../../input/InputState";
import { MotionController } from "../../motion/MotionController";
import type { RoomSession } from "../../net/RoomSession";
import {
  buildSnapshot,
  messageToInput,
  inputToMessage,
  GuestView,
  type WorldReadout,
} from "../../net/sync";
import {
  EV_SNAPSHOT,
  EV_INPUT,
  isSnapshot,
  isGuestInput,
} from "../../net/protocol";
import { SignalingClient } from "../../webrtc/SignalingClient";
import { CameraShare } from "../../webrtc/CameraShare";
import { VideoOverlay } from "../../webrtc/VideoOverlay";
import { FaceMaskPipeline } from "../../filter/FaceMaskPipeline";
import { DEFAULT_ANIMAL_ID } from "../../filter/AnimalMaskCatalog";

// 3단계: 통합 + 넓은 필드/골대/스코어.
// - 월드가 뷰포트보다 넓어 카메라가 공을 따라 좌우로 스크롤한다.
// - 양 끝 골대에 공이 들어가면 해당 스코어가 오른다.
// - 캐릭터 입력은 모션으로 구동하고, 카메라 못 쓰면 키보드로 폴백.
export class PlayScene extends Phaser.Scene {
  private field!: Field;
  private ball!: Ball;
  private player1!: Player;
  private player2!: Player;
  private goals: Goal[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private resetKey!: Phaser.Input.Keyboard.Key;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private motion = new MotionController();
  private statusText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;

  private scoreLeft = 0;
  private scoreRight = 0;
  private lastGoalAt = 0;

  private session: RoomSession | null = null;
  private roomCode: string | null = null;
  private mode: "host" | "guest" | "local" = "local";
  private guestView = new GuestView();
  private remoteInput: InputState = createEmptyInputState();
  private inputSeq = 0;
  private lastSnapshotAt = 0;
  private lastInputSentAt = 0;

  // WebRTC 카메라 공유
  private signaling: SignalingClient | null = null;
  private cameraShare: CameraShare | null = null;
  private localOverlay: VideoOverlay | null = null;
  private remoteOverlay: VideoOverlay | null = null;
  private faceMask: FaceMaskPipeline | null = null;
  private filterEnabled = false;
  private animalId = DEFAULT_ANIMAL_ID;

  constructor() {
    super("Play");
  }

  init(data: {
    session?: RoomSession;
    roomCode?: string;
    filterEnabled?: boolean;
    animalId?: string;
  }): void {
    this.session = data.session ?? null;
    this.roomCode = data.roomCode ?? null;
    this.mode = this.session ? this.session.role : "local";
    this.filterEnabled = data.filterEnabled ?? false;
    this.animalId = data.animalId ?? DEFAULT_ANIMAL_ID;
  }

  create(): void {
    const groundTop = GAME_HEIGHT - GROUND_HEIGHT;

    // 물리 월드 경계의 바닥을 '바닥 윗면'에 맞춘다.
    // collider는 프레임 끊김(모션 추론)으로 delta가 커지면 바닥을 통과(터널링)할 수 있지만,
    // 월드 경계는 적분 후 위치를 강제로 clamp하므로 절대 뚫리지 않는다.
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, groundTop);

    this.field = new Field(this);
    this.player1 = new Player(this, WORLD_WIDTH * 0.5 - 120, groundTop - PLAYER_HEIGHT);
    this.player2 = new Player(this, WORLD_WIDTH * 0.5 + 120, groundTop - PLAYER_HEIGHT, PLAYER2_COLOR);
    this.ball = new Ball(this, WORLD_WIDTH * 0.5, groundTop - 200);

    // 양 끝 골대
    this.goals = [
      new Goal(this, "left", WORLD_WIDTH, groundTop),
      new Goal(this, "right", WORLD_WIDTH, groundTop),
    ];

    // 충돌 설정
    for (const p of [this.player1, this.player2]) {
      this.physics.add.collider(p.sprite, this.field.ground);
      this.physics.add.collider(p.sprite, this.ball.sprite, () => {
        // 충돌 시 공을 플레이어 반대 방향으로 튕겨내며 포물선을 그리게 한다.
        const body = p.sprite.body as Phaser.Physics.Arcade.Body;
        this.ball.kick(p.sprite.x, body.velocity.x);
      });
    }
    this.physics.add.collider(this.ball.sprite, this.field.ground);
    // 캐릭터 간 충돌 (명세 2.4.2)
    this.physics.add.collider(this.player1.sprite, this.player2.sprite);

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
    this.wasd = keyboard.addKeys("W,A,D") as Record<string, Phaser.Input.Keyboard.Key>;

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.motion.stop();
      this.faceMask?.stop();
      this.cameraShare?.stop();
      this.signaling?.close();
      this.localOverlay?.remove();
      this.remoteOverlay?.remove();
      if (this.session) void this.session.channel.leave();
    });

    // 모션 시작(비동기). 준비될 때까지는 키보드로 조작 가능.
    void this.startMotion();

    if (this.session) {
      const ch = this.session.channel;
      if (this.mode === "host") {
        // guest 입력 수신 → player2 입력으로 사용
        ch.on(EV_INPUT, (p) => {
          if (isGuestInput(p)) this.remoteInput = messageToInput(p);
        });
      } else if (this.mode === "guest") {
        // host 스냅샷 수신 → 보간 버퍼에 push
        ch.on(EV_SNAPSHOT, (p) => {
          if (isSnapshot(p)) this.guestView.push(p, performance.now());
        });
        // guest는 로컬 물리 시뮬을 끈다(위치는 스냅샷으로 덮어씀)
        this.physics.world.pause();
      }
    }
  }

  private async startMotion(): Promise<void> {
    await this.motion.start();
    // 온라인이면 내/상대 웹캠은 VideoOverlay로 표시하므로 모션 프리뷰는 로컬 모드에서만.
    if (this.motion.ready && !this.session) {
      this.motion.attachPreview();
    }
    // 온라인 + 웹캠 확보 시 카메라 공유 시작(모션 인식 실패해도 스트림만 있으면 공유 가능).
    const stream = this.motion.stream;
    if (!(this.session && this.roomCode && stream)) return;

    if (!this.filterEnabled) {
      this.startCameraShare(stream);
      return;
    }

    // 얼굴 필터 ON: 합성 스트림만 상대에게 보낸다. 초기화 실패 시 원본 얼굴이 나갈 바에야
    // 카메라 공유 자체를 건너뛴다(프라이버시 보장이 조용히 깨지는 것을 방지).
    try {
      const pipeline = new FaceMaskPipeline(this.motion.video, this.animalId);
      await pipeline.init();
      this.faceMask = pipeline;
      this.startCameraShare(pipeline.outputStream);
    } catch (e) {
      console.warn("[face-mask] 초기화 실패 — 원본 얼굴 노출 방지를 위해 카메라 공유를 건너뜁니다", e);
    }
  }

  // WebRTC로 상대와 웹캠을 공유한다. 시그널링은 Railway(VITE_SIGNAL_URL)를 경유,
  // 영상은 P2P로 흐른다. host가 initiator(offer 생성).
  private startCameraShare(localStream: MediaStream): void {
    // 내 화면(자기 자신)은 항상 표시. 원본(비반전) 영상은 마주보는 카메라 특성상
    // 물리적으로 오른쪽으로 움직이면 화면에선 왼쪽으로 나타난다. 반면 캐릭터 조작은
    // "물리적 오른쪽 → 캐릭터 오른쪽"으로 매핑돼 있으므로, 화면 방향과 캐릭터 방향을
    // 맞추려면 거울 반전이 정확히 한 번 필요하다 — 이 CSS 반전이 그 한 번이다
    // (canvas 자체(AnimalMaskRenderer)는 반전하지 않은 원본 그대로 유지).
    this.localOverlay = new VideoOverlay({ id: "cam-local", corner: "right", label: "나", mirror: true });
    this.localOverlay.setStream(localStream);

    const url = import.meta.env.VITE_SIGNAL_URL;
    if (!url) {
      console.warn("[camera-share] VITE_SIGNAL_URL 미설정 — 상대 카메라 공유 비활성");
      return;
    }

    this.remoteOverlay = new VideoOverlay({ id: "cam-remote", corner: "left", label: "상대", mirror: false });

    const signaling = new SignalingClient(url, this.roomCode!);
    const isInitiator = this.mode === "host";
    const share = new CameraShare(signaling, isInitiator);
    share.onRemoteStream((s) => this.remoteOverlay!.setStream(s));

    this.signaling = signaling;
    this.cameraShare = share;

    signaling
      .connect()
      .then(({ peerPresent }) => share.start(localStream, peerPresent))
      .catch((e) => console.warn("[camera-share]", e));
  }

  update(): void {
    const now = performance.now();
    // PoseDetector(motion.poll)와 같은 프레임/타임스탬프로 얼굴 검출도 매 프레임 실행한다.
    this.faceMask?.update(now);

    if (this.mode === "guest") {
      this.updateGuest(now);
    } else {
      // host 또는 local
      this.player1.update(this.resolveInput(now));
      const p2Input = this.mode === "host" ? this.remoteInput : this.readWasd();
      this.player2.update(p2Input);

      if (this.mode === "host") this.maybeSendSnapshot(now);
    }

    this.updateStatus();

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.ball.reset();
    }
  }

  // 공이 골 영역에 들어오면 해당 스코어를 올리고 공을 중앙으로 리셋.
  private onGoal(side: GoalSide): void {
    if (this.mode === "guest") return; // 점수는 host 권위
    const now = this.time.now;
    if (now - this.lastGoalAt < GOAL_COOLDOWN_MS) return;
    this.lastGoalAt = now;

    if (side === "left") this.scoreLeft++;
    else this.scoreRight++;

    this.updateScoreboard();
    this.cameras.main.flash(200, 255, 255, 255);
    this.ball.reset();
    this.player1.reset();
    this.player2.reset();
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

  // local 모드 전용: player2 로컬 조작(WASD)
  private readWasd(): InputState {
    const input = createEmptyInputState();
    input.moveLeft = this.wasd.A.isDown;
    input.moveRight = this.wasd.D.isDown;
    input.jump = Phaser.Input.Keyboard.JustDown(this.wasd.W);
    return input;
  }

  // host: 일정 주기로 현재 월드 상태를 스냅샷으로 전송.
  private maybeSendSnapshot(now: number): void {
    const interval = 1000 / SNAPSHOT_HZ;
    if (now - this.lastSnapshotAt < interval) return;
    this.lastSnapshotAt = now;

    const w = this.readWorld();
    this.session!.channel.send(EV_SNAPSHOT, buildSnapshot(w, now));
  }

  // host: 스프라이트/게임 상태에서 스냅샷용 값을 읽는다.
  private readWorld(): WorldReadout {
    const b1 = this.player1.sprite.body as Phaser.Physics.Arcade.Body;
    const b2 = this.player2.sprite.body as Phaser.Physics.Arcade.Body;
    const bb = this.ball.sprite.body as Phaser.Physics.Arcade.Body;
    return {
      p1: { x: this.player1.sprite.x, y: this.player1.sprite.y, vx: b1.velocity.x, vy: b1.velocity.y, facing: this.player1.facing },
      p2: { x: this.player2.sprite.x, y: this.player2.sprite.y, vx: b2.velocity.x, vy: b2.velocity.y, facing: this.player2.facing },
      ball: { x: this.ball.sprite.x, y: this.ball.sprite.y, vx: bb.velocity.x, vy: bb.velocity.y },
      scoreL: this.scoreLeft,
      scoreR: this.scoreRight,
      clockMs: 0, // 경기 시계는 후속(명세 2.3) — 현재 0
      phase: "playing",
    };
  }

  // guest: 로컬 입력 전송 + 보간된 스냅샷을 스프라이트에 적용.
  private updateGuest(now: number): void {
    // 로컬 입력 전송(주기 제한)
    const interval = 1000 / INPUT_HZ;
    if (now - this.lastInputSentAt >= interval) {
      this.lastInputSentAt = now;
      const input = this.resolveInput(now);
      this.session!.channel.send(EV_INPUT, inputToMessage(input, this.inputSeq++));
    }

    // 보간 렌더(과거 시점)
    const s = this.guestView.render(now);
    if (s) {
      this.player1.applyState(s.p1.x, s.p1.y, s.p1.vx, s.p1.vy);
      this.player2.applyState(s.p2.x, s.p2.y, s.p2.vx, s.p2.vy);
      this.ball.sprite.setPosition(s.ball.x, s.ball.y);
      this.ball.sprite.setVelocity(s.ball.vx, s.ball.vy);
      this.scoreLeft = s.scoreL;
      this.scoreRight = s.scoreR;
      this.updateScoreboard();
    }
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
