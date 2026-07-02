// 공용 입력 타입.
// 모션이든 키보드든 동일한 InputState를 채우므로 게임 로직은 입력 출처를 모른다.
// 다음 반복에서 키보드/AI/네트워크 상대를 붙여도 게임 코드는 변하지 않는다.
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean; // 점프는 상승 에지에서만 한 프레임 true
}

export function createEmptyInputState(): InputState {
  return { moveLeft: false, moveRight: false, jump: false };
}
