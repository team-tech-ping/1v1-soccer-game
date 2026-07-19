import Phaser from "phaser";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  WORLD_WIDTH,
  GROUND_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER2_COLOR,
  GOAL_COOLDOWN_MS,
  SNAPSHOT_HZ,
  INPUT_HZ,
  MATCH_DURATION_MS,
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
import { FaceMaskPipeline } from "../../filter/FaceMaskPipeline";
import { DEFAULT_ANIMAL_ID } from "../../filter/AnimalMaskCatalog";

// 캐릭터 머리 위 원형 카메라 지름(px). 나/상대 동일.
const CAM_DIAMETER = 64;

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
  private fpsText!: Phaser.GameObjects.Text;
  private fps = 60;
  private scoreText!: Phaser.GameObjects.Text;

  private scoreLeft = 0;
  private scoreRight = 0;
  private lastGoalAt = 0;

  // 경기 시간
  private matchStartAt = 0;
  private matchEnded = false;
  private clockText!: Phaser.GameObjects.Text;
  // 상대 이탈 판정용: 마지막으로 알려진 남은 시간(guest는 스냅샷 clockMs, host/local은 remainingMs).
  private lastKnownRemainingMs = MATCH_DURATION_MS;

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
  private localCam: Phaser.GameObjects.Video | null = null;
  private remoteCam: Phaser.GameObjects.Video | null = null;
  private overlaysActive = true;
  private faceMask: FaceMaskPipeline | null = null;
  private filterEnabled = false;
  private animalId = DEFAULT_ANIMAL_ID;
  private filterToggleText: Phaser.GameObjects.Text | null = null;

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

    // Phaser는 scene.start()를 다시 호출해도 씬 인스턴스를 새로 만들지 않고 재사용한다.
    // 클래스 필드 초기값(= 0, null 등)은 객체 생성 시 단 한 번만 적용되므로, 두 번째
    // 매치부터는 여기서 매치별 상태를 명시적으로 리셋하지 않으면 이전 매치의 점수·
    // 종료 플래그·카메라 참조가 그대로 남는다(예: matchEnded가 true로 남으면 update()가
    // 매 프레임 조기 리턴해 모션 상태 텍스트·카메라 배치가 다시는 갱신되지 않는다).
    this.scoreLeft = 0;
    this.scoreRight = 0;
    this.lastGoalAt = 0;
    this.matchEnded = false;
    this.matchStartAt = 0; // create()에서 다시 정확히 설정된다
    this.lastKnownRemainingMs = MATCH_DURATION_MS;

    this.guestView = new GuestView();
    this.remoteInput = createEmptyInputState();
    this.inputSeq = 0;
    this.lastSnapshotAt = 0;
    this.lastInputSentAt = 0;

    // 이전 매치에서 만든 카메라/필터 관련 객체는 씬 SHUTDOWN 시 이미 정리(stop/close)됐거나
    // Phaser가 파괴했다. 여기서 참조 자체를 비워 다음 매치가 항상 새로 만들게 한다.
    this.signaling = null;
    this.cameraShare = null;
    this.localCam = null;
    this.remoteCam = null;
    this.overlaysActive = true;
    this.faceMask = null;
    this.filterToggleText = null;
  }

  create(): void {
    // performance.now()를 쓴다(this.time.now가 아니라): Phaser의 scene.time.now는
    // 씬이 비활성인 동안 갱신되지 않아, 재매칭 시 create()에서 읽으면 '이전 경기
    // 종료 시각'으로 얼어붙어 있다. 그러면 경기 사이(결과·홈·매칭 대기)에 흐른 시간이
    // 통째로 경기 시간에서 깎여, 시간이 줄어든 채 시작하거나(심하면) 즉시 종료된다.
    this.matchStartAt = performance.now();
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
        // 공이 플레이어 발밑에서 수직으로 떠받쳐지는 상태(위에 올라탐)인지 위치로 판별한다.
        // (body.touching 플래그는 같은 스텝의 다른 콜라이더-예: 바닥-와 뒤섞일 수 있어
        // 신뢰할 수 없다. 기하학적으로 '발밑 근처·아래'인지 직접 확인한다.)
        const dx = Math.abs(this.ball.sprite.x - p.sprite.x);
        const dy = this.ball.sprite.y - p.sprite.y; // 양수: 공이 플레이어보다 아래(발밑)
        const standingOnBall = dy > PLAYER_HEIGHT * 0.25 && dx < PLAYER_WIDTH * 0.4;
        if (standingOnBall) {
          this.ball.stomp(p.sprite.x);
        } else {
          // 충돌 시 공을 플레이어 반대 방향으로 튕겨내며 포물선을 그리게 한다.
          const body = p.sprite.body as Phaser.Physics.Arcade.Body;
          this.ball.kick(p.sprite.x, body.velocity.x);
        }
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
    // 진단용: V 키로 카메라 오버레이 On/Off (디코드/합성 비용 격리)
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V).on("down", () => this.toggleOverlays());

    // HUD: 카메라에 고정(스크롤 무시).
    this.statusText = this.add
      .text(24, 20, "모션: 초기화 중...", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#ffd166",
      })
      .setScrollFactor(0);

    // 진단용 FPS 미터 — 실제 렌더 루프 프레임레이트를 표시.
    this.fpsText = this.add
      .text(24, 42, "FPS --", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#90e0ef",
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

    this.clockText = this.add
      .text(GAME_WIDTH / 2, 52, this.formatClock(MATCH_DURATION_MS), {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#8fa3bf",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    // 우상단 버튼들(스택). 온라인이면 '나가기', 필터 켰으면 '필터 끄기'.
    let rightY = 20;
    if (this.session) {
      this.add
        .text(GAME_WIDTH - 24, rightY, "🚪 나가기", {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#e0e1dd",
          backgroundColor: "#00000099",
          padding: { x: 10, y: 6 },
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2000)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.leaveMatch());
      rightY += 34;
    }

    // 경기 중 얼굴 필터를 끌 수 있는 버튼(필터를 켜고 입장했을 때만 표시).
    if (this.filterEnabled) {
      this.filterToggleText = this.add
        .text(GAME_WIDTH - 24, rightY, "🎭 필터 끄기", {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#e0e1dd",
          backgroundColor: "#00000099",
          padding: { x: 10, y: 6 },
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2000)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.turnOffFilter());
    }

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
      // Phaser Video는 씬 종료 시 자동 파괴됨(별도 DOM 없음). 마스크 그래픽만 명시적으로 정리.
      (this.localCam?.getData("mask") as Phaser.GameObjects.Graphics | undefined)?.destroy();
      (this.remoteCam?.getData("mask") as Phaser.GameObjects.Graphics | undefined)?.destroy();
      if (this.session) void this.session.channel.leave();
    });

    // 모션 시작(비동기). 준비될 때까지는 키보드로 조작 가능.
    void this.startMotion();

    if (this.session) {
      const ch = this.session.channel;
      // 상대 이탈 감지: presence 인원이 2 미만으로 떨어지면 상대가 나간 것 → 남은 내가 승리.
      // (matchStart는 이미 인원 2에서 발화했으므로, 이 시점 이후의 하락은 이탈을 뜻한다.)
      ch.onPresenceChange((count) => {
        if (count < 2) this.opponentLeft();
      });
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
    // 온라인이면 내/상대 웹캠은 캔버스 비디오로 표시하므로 모션 프리뷰는 로컬 모드에서만.
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
    // 내 카메라를 내 캐릭터 머리 위에 표시. 캔버스 텍스처라 DOM 합성 비용 없음.
    // 거울 반전(setFlipX): 마주보는 카메라 원본은 물리적 오른쪽이 화면 왼쪽으로 나타나는데
    // 캐릭터 조작은 "물리적 오른쪽 → 캐릭터 오른쪽"이므로 방향을 맞추려면 반전이 한 번 필요.
    // 역할별 '내/상대' 캐릭터 매핑(카메라·히트박스가 이 캐릭터를 따라간다).
    const mine = this.mode === "guest" ? this.player2 : this.player1;
    const opponent = this.mode === "guest" ? this.player1 : this.player2;

    this.localCam = this.addCamVideo(localStream, true, mine);

    const url = import.meta.env.VITE_SIGNAL_URL;
    if (!url) {
      console.warn("[camera-share] VITE_SIGNAL_URL 미설정 — 상대 카메라 공유 비활성");
      return;
    }

    const signaling = new SignalingClient(url, this.roomCode!);
    const isInitiator = this.mode === "host";
    const share = new CameraShare(signaling, isInitiator);
    share.onRemoteStream((s) => {
      if (this.remoteCam) {
        this.remoteCam.loadMediaStream(s, true);
        this.remoteCam.play();
      } else {
        this.remoteCam = this.addCamVideo(s, true, opponent);
      }
    });

    this.signaling = signaling;
    this.cameraShare = share;

    signaling
      .connect()
      .then(({ peerPresent }) => share.start(localStream, peerPresent))
      .catch((e) => console.warn("[camera-share]", e));
  }

  // 경기 중 얼굴 필터를 끈다: 검출 파이프라인을 멈추고, 상대에게 나가는 스트림을
  // 원본 웹캠으로 교체한다(재협상 없이 트랙만 바꿔치기). 되돌리기는 지원하지 않는다.
  private turnOffFilter(): void {
    if (!this.filterEnabled) return;
    this.filterEnabled = false;
    this.filterToggleText?.destroy();
    this.filterToggleText = null;

    this.faceMask?.stop();
    this.faceMask = null;

    const raw = this.motion.stream;
    if (raw) {
      this.localCam?.loadMediaStream(raw, true);
      this.localCam?.play();
      void this.cameraShare?.replaceStream(raw);
    }
  }

  // 웹캠 스트림을 캐릭터 머리 위에 작게 그린다(Phaser 캔버스 텍스처 — DOM 오버레이 아님).
  // scrollFactor 기본(1) → 월드를 따라 스크롤. 위치는 매 프레임 positionCameras()가 갱신.
  private addCamVideo(
    stream: MediaStream,
    mirror: boolean,
    owner: Player
  ): Phaser.GameObjects.Video {
    const D = CAM_DIAMETER; // 원 지름 — 나/상대 동일(보이는 원 크기가 곧 D라 항상 같다)
    const v = this.add.video(0, 0).setDepth(50).setOrigin(0.5);
    if (mirror) v.setFlipX(true);
    v.setData("owner", owner);

    // 원형 크롭: 흰 원 geometry mask. 표시는 안 되고 스텐실로만 쓰인다.
    const maskG = this.make.graphics();
    maskG.fillStyle(0xffffff);
    maskG.fillCircle(0, 0, D / 2);
    v.setMask(maskG.createGeometryMask());
    v.setData("mask", maskG);

    // 머리 타격 판정: 원과 같은 크기의 물리 히트박스(무중력·immovable). 소유 캐릭터를 따라다니며
    // 공과 충돌 시 소유 캐릭터 속도로 헤딩(플레이어 바디 kick과 동일). placeCam에서 매 프레임 이동.
    const hit = this.add.circle(0, 0, D / 2).setVisible(false);
    this.physics.add.existing(hit);
    const hitBody = hit.body as Phaser.Physics.Arcade.Body;
    hitBody.setCircle(D / 2);
    hitBody.setAllowGravity(false);
    hitBody.setImmovable(true);
    this.physics.add.collider(this.ball.sprite, hit, () => {
      const ob = owner.sprite.body as Phaser.Physics.Arcade.Body;
      this.ball.head(hit.x, ob.velocity.x);
    });
    v.setData("hit", hit);

    // 표시 크기는 placeCam()에서 매 프레임 라이브 해상도로 재계산한다(fitCamSquare).
    // MediaStream은 해상도가 늦게 확정되거나 도중에 바뀔 수 있어, textureready 순간
    // 한 번만 계산하면 로컬/원격이 서로 다른 크기로 굳는다.
    v.loadMediaStream(stream, true);
    v.play();
    return v;
  }

  // 각 카메라(+마스크+히트박스)를 소유 캐릭터 머리 위로 이동(매 프레임).
  private positionCameras(): void {
    this.placeCam(this.localCam);
    this.placeCam(this.remoteCam);
  }

  // 라이브 소스 해상도로 "짧은 변 = CAM_DIAMETER"가 되게 매 프레임 재계산한다.
  // 소스 해상도/타이밍과 무관하게 항상 같은 크기(원 지름 D)로 정규화되어,
  // 로컬 미리보기와 상대가 받는 화면의 확대 배율이 동일해진다.
  private fitCamSquare(cam: Phaser.GameObjects.Video): void {
    const el = cam.video;
    if (!el || el.videoWidth === 0 || el.videoHeight === 0) return;
    const s = CAM_DIAMETER / Math.min(el.videoWidth, el.videoHeight);
    cam.setDisplaySize(el.videoWidth * s, el.videoHeight * s);
  }

  private placeCam(cam: Phaser.GameObjects.Video | null): void {
    if (!cam) return;
    this.fitCamSquare(cam);
    const owner = cam.getData("owner") as Player;
    const dy = PLAYER_HEIGHT / 2 + CAM_DIAMETER / 2 + 6; // 머리 위로 살짝
    const x = owner.sprite.x;
    const y = owner.sprite.y - dy;
    cam.setPosition(x, y);
    // 원형 마스크도 같은 위치로(안 그러면 마스크가 안 따라와 잘림).
    (cam.getData("mask") as Phaser.GameObjects.Graphics | undefined)?.setPosition(x, y);
    // 히트박스도 머리 위치로(속도 0으로 고정). 공이 이 원에 부딪히면 위 collider가 헤딩 처리.
    const hit = cam.getData("hit") as Phaser.GameObjects.Arc | undefined;
    if (hit) (hit.body as Phaser.Physics.Arcade.Body).reset(x, y);
  }

  private toggleOverlays(): void {
    this.overlaysActive = !this.overlaysActive;
    this.localCam?.setVisible(this.overlaysActive);
    this.remoteCam?.setVisible(this.overlaysActive);
  }

  update(_time: number, delta: number): void {
    const now = performance.now();

    // 실제 프레임레이트(EMA). delta는 직전 프레임 소요 ms.
    this.fps = this.fps * 0.9 + (1000 / Math.max(delta, 1)) * 0.1;
    let fpsLine = `FPS ${this.fps.toFixed(0)}`;
    if (this.faceMask) {
      fpsLine += `  얼굴 ${this.faceMask.lastInferenceMs.toFixed(0)}ms · 렌더 ${this.faceMask.lastRenderMs.toFixed(0)}ms`;
    }
    this.fpsText.setText(fpsLine);

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

      const remaining = this.remainingMs();
      this.lastKnownRemainingMs = remaining;
      this.clockText.setText(this.formatClock(remaining));
      if (remaining <= 0 && !this.matchEnded) {
        this.endMatch();
      }
    }

    // 경기가 끝났다면(막 endMatch()가 호출됐거나 guest가 종료 스냅샷을 받았다면)
    // 씬 전환이 처리될 때까지 나머지 프레임 로직은 건너뛴다.
    if (this.matchEnded) return;

    this.positionCameras();
    this.updateStatus();

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.ball.reset();
    }
  }

  // 공이 골 영역에 들어오면 해당 스코어를 올리고 공을 중앙으로 리셋.
  // 축구 규칙: 왼쪽 골에 넣으면 '오른쪽' 팀(상대) 득점, 오른쪽 골에 넣으면 '왼쪽' 팀 득점.
  private onGoal(side: GoalSide): void {
    if (this.mode === "guest") return; // 점수는 host 권위
    const now = performance.now();
    if (now - this.lastGoalAt < GOAL_COOLDOWN_MS) return;
    this.lastGoalAt = now;

    if (side === "left") this.scoreRight++;
    else this.scoreLeft++;

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

  // 남은 경기 시간(ms). host/local이 실시간으로 계산하는 권위 값이다.
  // matchStartAt과 동일하게 performance.now() 기준(this.time.now는 씬 비활성 중 얼어붙음).
  private remainingMs(): number {
    return Math.max(0, MATCH_DURATION_MS - (performance.now() - this.matchStartAt));
  }

  private formatClock(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // 시간 종료 시 호출(host/local 전용). 물리를 멈추고, host면 종료 스냅샷을 한 번 더
  // 즉시 보내 guest도 지체 없이 결과 화면으로 넘어가게 한 뒤 Result로 전환한다.
  private endMatch(): void {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.physics.world.pause();
    if (this.mode === "host" && this.session) {
      const w = this.readWorld();
      this.session.channel.send(EV_SNAPSHOT, buildSnapshot(w, performance.now()));
    }
    this.goToResult();
  }

  private goToResult(): void {
    this.scene.start("Result", {
      scoreLeft: this.scoreLeft,
      scoreRight: this.scoreRight,
      mode: this.mode,
    });
  }

  // 상대가 이탈(탭 닫기·나가기·연결 끊김)해 presence가 떨어졌을 때: 남은 내가 승리.
  private opponentLeft(): void {
    if (this.matchEnded) return;
    // 시작 직후 설정 중의 일시적 presence 흔들림은 무시(오탐 방지).
    if (performance.now() - this.matchStartAt < 1500) return;
    // 정상 시간 종료 직전이면(≤3s) 이탈로 처리하지 않는다 — 종료 시 상대가 채널을 떠나며
    // presence가 떨어지는 것과 '이탈 승리'가 경합해 정상 결과를 덮어쓰는 것을 막는다.
    const remaining = this.mode === "guest" ? this.lastKnownRemainingMs : this.remainingMs();
    if (remaining <= 3000) return;

    this.matchEnded = true;
    this.physics.world.pause();
    this.scene.start("Result", {
      scoreLeft: this.scoreLeft,
      scoreRight: this.scoreRight,
      mode: this.mode,
      forfeit: true,
    });
  }

  // 스스로 경기를 나간다: 홈으로 이동. SHUTDOWN에서 channel.leave()가 호출되어
  // 상대의 presence가 떨어지고, 상대는 opponentLeft()로 승리 처리된다.
  private leaveMatch(): void {
    this.matchEnded = true; // 남은 프레임에서 종료 로직 재진입 방지
    this.scene.start("Home");
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
      clockMs: this.remainingMs(),
      phase: this.matchEnded ? "ended" : "playing",
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
      this.lastKnownRemainingMs = s.clockMs;
      this.clockText.setText(this.formatClock(s.clockMs));
      if (s.phase === "ended" && !this.matchEnded) {
        this.matchEnded = true;
        this.goToResult();
      }
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
