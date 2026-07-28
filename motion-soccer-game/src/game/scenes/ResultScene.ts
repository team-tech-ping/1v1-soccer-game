import Phaser from "phaser";

// 경기 종료 후 승/패/무 결과를 보여주는 화면.
// mode가 있으면(host/guest) 그 플레이어 관점의 승/패로, local이면 좌/우 승리로 표시한다.
const STYLE_ID = "msg-result-style";

const CSS = `
.msg-result-overlay {
  position: fixed; inset: 0; z-index: 20;
  display: flex; align-items: center; justify-content: center;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 16px;
}
.msg-result-card {
  width: 360px; max-width: 100%;
  background: rgba(15, 26, 46, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px; padding: 32px 26px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  color: #e0e1dd; box-sizing: border-box; text-align: center;
}
.msg-result-title { font-size: 30px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.4px; }
.msg-result-title.win { color: #7ee787; }
.msg-result-title.lose { color: #ff8f8f; }
.msg-result-title.draw { color: #ffd166; }
.msg-result-note { font-size: 13px; color: #8fa3bf; margin: 8px 0 0; }
.msg-result-score { font-size: 40px; font-weight: 800; letter-spacing: 4px; margin: 18px 0 26px; color: #e0e1dd; }
.msg-result-btn {
  display: block; width: 100%; padding: 12px; box-sizing: border-box;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: filter .15s;
  background: #4cc9f0; color: #08111f;
}
.msg-result-btn:hover { filter: brightness(1.08); }
.msg-result-btn:active { transform: translateY(1px); }
`;

interface ResultData {
  scoreLeft: number;
  scoreRight: number;
  mode: "host" | "guest" | "local";
  forfeit?: boolean; // 상대 이탈로 인한 승리(이 화면의 플레이어가 승자)
}

export class ResultScene extends Phaser.Scene {
  private overlay: HTMLDivElement | null = null;
  private result!: ResultData;

  constructor() {
    super("Result");
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    this.injectStyles();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    const { scoreLeft, scoreRight, mode, forfeit } = this.result;
    const { title, cls } = this.describe(scoreLeft, scoreRight, mode, forfeit);

    const overlay = document.createElement("div");
    overlay.className = "msg-result-overlay";
    const card = document.createElement("div");
    card.className = "msg-result-card";

    const titleEl = document.createElement("h1");
    titleEl.className = `msg-result-title ${cls}`;
    titleEl.textContent = title;
    card.appendChild(titleEl);

    if (forfeit) {
      const note = document.createElement("p");
      note.className = "msg-result-note";
      note.textContent = "상대가 게임을 나갔습니다";
      card.appendChild(note);
    }

    const scoreEl = document.createElement("div");
    scoreEl.className = "msg-result-score";
    scoreEl.textContent = `${scoreLeft} : ${scoreRight}`;
    card.appendChild(scoreEl);

    const homeBtn = document.createElement("button");
    homeBtn.className = "msg-result-btn";
    homeBtn.textContent = "홈으로";
    homeBtn.onclick = () => this.scene.start("Home");
    card.appendChild(homeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  // mode가 host/guest면 그 플레이어 관점(host=왼쪽, guest=오른쪽)의 승/패로,
  // local(같은 기기에서 둘이 조작)이면 어느 쪽이 이겼는지로 표시한다.
  private describe(
    scoreLeft: number,
    scoreRight: number,
    mode: ResultData["mode"],
    forfeit?: boolean
  ): { title: string; cls: string } {
    // 상대 이탈: 이 화면을 보는 사람이 남은 플레이어 → 무조건 승리.
    if (forfeit) return { title: "승리! 🎉", cls: "win" };

    if (scoreLeft === scoreRight) return { title: "무승부!", cls: "draw" };

    const leftWins = scoreLeft > scoreRight;
    if (mode === "local") {
      return leftWins ? { title: "왼쪽 승리!", cls: "win" } : { title: "오른쪽 승리!", cls: "win" };
    }
    const myWin = mode === "guest" ? !leftWins : leftWins;
    return myWin ? { title: "승리!", cls: "win" } : { title: "패배", cls: "lose" };
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
