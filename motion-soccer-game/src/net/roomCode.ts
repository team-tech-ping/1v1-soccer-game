import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from "../config";

// 방 코드: 사람이 읽고 입력하기 쉬운 짧은 코드. 혼동 문자는 알파벳에서 제외됨.
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

// 사용자 입력을 코드 형식으로 정규화: 대문자화 + 알파벳 외 문자 제거.
export function normalizeRoomCode(raw: string): string {
  const upper = raw.toUpperCase();
  let out = "";
  for (const ch of upper) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out;
}
