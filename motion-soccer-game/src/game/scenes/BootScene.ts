import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../config";

// 0단계: 빈 게임 캔버스가 정상적으로 렌더되는지 확인하기 위한 부트 씬.
// 이후 단계에서 에셋 로드 + 로딩 표시, 그리고 Home 씬으로의 전환을 담당하게 된다.
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "모션 인식 웹 2D 축구 게임\n(셋업 완료)", {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: "#e0e1dd",
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 32, "0단계: Vite + TypeScript + Phaser 3", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#778da9",
      })
      .setOrigin(0.5);
  }
}
