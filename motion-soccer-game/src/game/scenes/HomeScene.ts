import Phaser from "phaser";
import { generateRoomCode, normalizeRoomCode } from "../../net/roomCode";
import { createSupabaseChannel } from "../../net/SupabaseChannel";
import { RoomSession, type Role } from "../../net/RoomSession";

// 시작 화면: 방 만들기(host) / 코드 입장(guest). 명세 5.1.
// 캔버스 위에 '중앙 정렬 카드' 하나(DOM)를 올려 레이아웃을 flexbox로 처리한다.
// (게임 좌표에 fixed 요소를 흩뿌리던 방식은 겹침/정렬 문제가 있어 폐기)
const STYLE_ID = "msg-home-style";

const CSS = `
.msg-home-overlay {
  position: fixed; inset: 0; z-index: 20;
  display: flex; align-items: center; justify-content: center;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 16px;
}
.msg-home-card {
  width: 360px; max-width: 100%;
  background: rgba(15, 26, 46, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px; padding: 28px 26px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  color: #e0e1dd; box-sizing: border-box;
}
.msg-home-title { font-size: 25px; font-weight: 800; text-align: center; margin: 0 0 4px; letter-spacing: -0.4px; }
.msg-home-sub { font-size: 13px; color: #8fa3bf; text-align: center; margin: 0 0 22px; }
.msg-home-btn {
  display: block; width: 100%; padding: 12px; box-sizing: border-box;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: filter .15s, background .15s, transform .05s;
}
.msg-home-btn:active { transform: translateY(1px); }
.msg-home-primary { background: #4cc9f0; color: #08111f; }
.msg-home-primary:hover { filter: brightness(1.08); }
.msg-home-secondary {
  flex: 0 0 auto; width: auto; padding: 11px 18px;
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.18); color: #e0e1dd;
}
.msg-home-secondary:hover { background: rgba(255, 255, 255, 0.07); }
.msg-home-divider { display: flex; align-items: center; gap: 10px; color: #5f7189; font-size: 12px; margin: 18px 0; }
.msg-home-divider::before, .msg-home-divider::after { content: ""; flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1); }
.msg-home-row { display: flex; gap: 8px; }
.msg-home-input {
  flex: 1; min-width: 0; padding: 11px 12px; box-sizing: border-box;
  border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.14);
  background: #0b1524; color: #e0e1dd; font-size: 15px;
  letter-spacing: 3px; text-transform: uppercase; outline: none; transition: border-color .15s;
}
.msg-home-input::placeholder { color: #556074; letter-spacing: normal; text-transform: none; }
.msg-home-input:focus { border-color: #4cc9f0; }
.msg-home-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; text-align: center; margin: 8px 0 16px; color: #4cc9f0; }
.msg-home-linkrow { display: flex; gap: 8px; }
.msg-home-linkfield {
  flex: 1; min-width: 0; padding: 9px 10px; box-sizing: border-box;
  border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0b1524; color: #8fa3bf; font-size: 12px;
}
.msg-home-wait { margin-top: 18px; font-size: 13px; color: #8fa3bf; text-align: center; }
.msg-home-error { margin-top: 16px; font-size: 13px; color: #ff8f8f; text-align: center; line-height: 1.5; }
`;

export class HomeScene extends Phaser.Scene {
  private overlay: HTMLDivElement | null = null;

  constructor() {
    super("Home");
  }

  create(): void {
    this.injectStyles();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // URL ?room= 있으면 guest 자동 입장
    const roomParam = new URLSearchParams(window.location.search).get("room");
    if (roomParam) {
      const code = normalizeRoomCode(roomParam);
      if (code.length === 0) {
        this.renderLobby("잘못된 초대 링크입니다");
      } else {
        this.renderWaiting("입장 중…", code, "연결하는 중…");
        void this.enterRoom(code, "guest");
      }
      return;
    }

    this.renderLobby();
  }

  // 초기 로비: 방 만들기 / 코드 입장.
  private renderLobby(errorMsg?: string): void {
    const card = this.mountCard();
    card.appendChild(this.el("h1", "msg-home-title", "모션 축구 1v1"));
    card.appendChild(this.el("p", "msg-home-sub", "웹캠 모션으로 즐기는 실시간 1대1 축구"));

    const createBtn = this.el("button", "msg-home-btn msg-home-primary", "방 만들기") as HTMLButtonElement;
    createBtn.onclick = () => this.onCreate();
    card.appendChild(createBtn);

    card.appendChild(this.el("div", "msg-home-divider", "또는"));

    const row = this.el("div", "msg-home-row");
    const input = this.el("input", "msg-home-input") as HTMLInputElement;
    input.placeholder = "코드 입력";
    input.maxLength = 8;
    const joinBtn = this.el("button", "msg-home-btn msg-home-secondary", "입장") as HTMLButtonElement;
    const submit = () => this.onJoin(input.value);
    joinBtn.onclick = submit;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    row.appendChild(input);
    row.appendChild(joinBtn);
    card.appendChild(row);

    if (errorMsg) card.appendChild(this.el("div", "msg-home-error", errorMsg));
    input.focus();
  }

  // 대기 화면: 방 코드 + 초대 링크(복사) + 상대 대기.
  private renderWaiting(title: string, code: string, waitMsg: string): void {
    const card = this.mountCard();
    card.appendChild(this.el("h1", "msg-home-title", title));
    card.appendChild(this.el("p", "msg-home-sub", "친구에게 코드나 링크를 보내세요"));
    card.appendChild(this.el("div", "msg-home-code", code));

    const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
    const linkRow = this.el("div", "msg-home-linkrow");
    const linkField = this.el("input", "msg-home-linkfield") as HTMLInputElement;
    linkField.readOnly = true;
    linkField.value = link;
    const copyBtn = this.el("button", "msg-home-btn msg-home-secondary", "복사") as HTMLButtonElement;
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = "복사됨!";
        setTimeout(() => (copyBtn.textContent = "복사"), 1500);
      } catch {
        linkField.select();
      }
    };
    linkRow.appendChild(linkField);
    linkRow.appendChild(copyBtn);
    card.appendChild(linkRow);

    card.appendChild(this.el("div", "msg-home-wait", waitMsg));
  }

  private onCreate(): void {
    const code = generateRoomCode();
    this.renderWaiting("방이 열렸어요", code, "상대 입장을 기다리는 중…");
    void this.enterRoom(code, "host");
  }

  private onJoin(raw: string): void {
    const code = normalizeRoomCode(raw);
    if (code.length === 0) {
      this.renderLobby("코드를 입력하세요");
      return;
    }
    this.renderWaiting("입장 중…", code, "연결하는 중…");
    void this.enterRoom(code, "guest");
  }

  private async enterRoom(code: string, role: Role): Promise<void> {
    try {
      const channel = createSupabaseChannel(code);
      const session = new RoomSession(channel, role);
      session.onReady(() => {
        this.scene.start("Play", { session, roomCode: code });
      });
      await session.start();
    } catch (e) {
      this.renderLobby(`연결 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 오버레이(카드 컨테이너)를 새로 만든다. 이전 것은 제거해 상태 전환 시 겹치지 않게.
  private mountCard(): HTMLDivElement {
    this.overlay?.remove();
    const overlay = document.createElement("div");
    overlay.className = "msg-home-overlay";
    const card = document.createElement("div");
    card.className = "msg-home-card";
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.overlay = overlay;
    return card;
  }

  private el(tag: string, className: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  private cleanup(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
}
