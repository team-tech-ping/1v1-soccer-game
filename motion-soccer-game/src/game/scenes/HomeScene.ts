import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../config";
import { generateRoomCode, normalizeRoomCode } from "../../net/roomCode";
import { createSupabaseChannel } from "../../net/SupabaseChannel";
import { RoomSession, type Role } from "../../net/RoomSession";

// 시작 화면: 방 만들기(host) / 코드 입장(guest). 명세 5.1.
// DOM 요소(버튼/입력)를 Phaser 위에 얹어 간단히 처리한다.
export class HomeScene extends Phaser.Scene {
  private info!: Phaser.GameObjects.Text;
  private dom: HTMLElement[] = [];

  constructor() {
    super("Home");
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, 80, "모션 축구 1v1", {
        fontFamily: "sans-serif",
        fontSize: "40px",
        fontStyle: "bold",
        color: "#e0e1dd",
      })
      .setOrigin(0.5);

    this.info = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffd166",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupDom());

    // URL ?room= 있으면 guest 자동 입장
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const code = normalizeRoomCode(roomParam);
      this.info.setText(`방 ${code} 입장 중...`);
      void this.enterRoom(code, "guest");
      return;
    }

    this.buildLobbyUi();
  }

  private buildLobbyUi(): void {
    this.makeButton("방 만들기", GAME_WIDTH / 2, 200, () => {
      const code = generateRoomCode();
      const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
      this.info.setText(`방 코드: ${code}\n초대 링크(복사해 친구에게 전송):\n${link}\n상대 입장 대기 중...`);
      this.cleanupDom();
      void this.enterRoom(code, "host");
    });

    const input = document.createElement("input");
    input.placeholder = "코드 입력";
    input.maxLength = 8;
    this.styleDom(input, GAME_WIDTH / 2 - 80, 280, 120);

    this.makeButton("입장", GAME_WIDTH / 2 + 60, 280, () => {
      const code = normalizeRoomCode(input.value);
      if (code.length === 0) {
        this.info.setText("코드를 입력하세요");
        return;
      }
      this.info.setText(`방 ${code} 입장 중...`);
      this.cleanupDom();
      void this.enterRoom(code, "guest");
    });
  }

  private async enterRoom(code: string, role: Role): Promise<void> {
    try {
      const channel = createSupabaseChannel(code);
      const session = new RoomSession(channel, role);
      session.onReady(() => {
        this.scene.start("Play", { session });
      });
      await session.start();
    } catch (e) {
      this.info.setText(`연결 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Phaser 캔버스 위에 HTML 버튼을 얹는다.
  private makeButton(label: string, x: number, y: number, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cursor = "pointer";
    btn.onclick = onClick;
    this.styleDom(btn, x - 70, y, 140);
    return btn;
  }

  private styleDom(el: HTMLElement, left: number, top: number, width: number): void {
    Object.assign(el.style, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: "40px",
      fontSize: "16px",
      zIndex: "20",
    } as Partial<CSSStyleDeclaration>);
    if (el instanceof HTMLElement && !el.parentElement) document.body.appendChild(el);
    this.dom.push(el);
  }

  private cleanupDom(): void {
    for (const el of this.dom) el.remove();
    this.dom = [];
  }
}
