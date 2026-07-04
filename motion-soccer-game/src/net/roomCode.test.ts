import { describe, it, expect } from "vitest";
import { generateRoomCode, normalizeRoomCode } from "./roomCode";
import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from "../config";

describe("roomCode", () => {
  it("정해진 길이의 코드를 만든다", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("허용된 알파벳 문자만 사용한다", () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("normalize는 대문자화하고 공백을 제거한다", () => {
    expect(normalizeRoomCode("  ab2d ")).toBe("AB2D");
  });

  it("normalize는 알파벳 외 문자를 제거한다", () => {
    expect(normalizeRoomCode("a-b/2!d")).toBe("AB2D");
  });
});
