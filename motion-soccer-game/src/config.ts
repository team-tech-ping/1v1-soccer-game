// 전역 설정: 화면 크기, 물리 상수 등.
// MVP 단계에서 값들을 한곳에서 조정할 수 있도록 모아둔다.

export const GAME_WIDTH = 960; // 뷰포트(카메라) 가로
export const GAME_HEIGHT = 540;

// 월드(필드): 뷰포트보다 넓어 카메라가 공을 따라 좌우로 스크롤한다.
export const WORLD_WIDTH = GAME_WIDTH * 3; // 2880

export const BACKGROUND_COLOR = "#1b263b";

// 물리 (Arcade)
export const GRAVITY_Y = 1200;

// 필드
export const GROUND_HEIGHT = 48;
export const GROUND_COLOR = 0x2a9d8f;

// 플레이어
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 72;
export const PLAYER_COLOR = 0x4cc9f0;
export const PLAYER2_COLOR = 0xff6b6b; // 오른쪽(guest) 플레이어 색
export const PLAYER_SPEED = 440; // 좌우 이동 속도(px/s)
export const PLAYER_JUMP_VELOCITY = -650; // 점프 초기 속도(px/s, 위쪽이 음수)

// 공
export const BALL_RADIUS = 22;
export const BALL_COLOR = 0xf1faee;
export const BALL_BOUNCE = 0.82; // 반발 계수
export const BALL_DRAG_X = 60; // 굴러갈 때 수평 감속(마찰 근사)
export const BALL_MASS = 0.5; // 플레이어보다 가벼워 잘 밀리도록
export const BALL_KICK_LIFT = 320; // 충돌 시 위로 떠오르는 속도(px/s) — 포물선
export const BALL_MIN_KICK_SPEED = 220; // 충돌 시 최소 수평 발사 속도(px/s)
export const BALL_KICK_COOLDOWN_MS = 180; // 접촉 중 재발동 방지 쿨다운
// 헤딩(머리 타격)은 몸통 킥보다 약하게: 킥 계산 결과에 이 배수를 곱한다.
export const HEAD_POWER_SCALE = 0.5;
// 공 최대 속도 상한(안전장치). 연속 킥/헤딩으로 속도가 무한정 커지는 것을 막아
// 물리 스텝당 이동 거리를 충돌 판정 크기 이내로 유지한다(터널링 방지).
export const BALL_MAX_VELOCITY_X = 900;
export const BALL_MAX_VELOCITY_Y = 1400;

// 골대 (필드 양 끝)
export const GOAL_WIDTH = 50; // 골 감지 영역 가로(px)
export const GOAL_HEIGHT = 240; // 골대 높이(바닥부터, px)
export const GOAL_POST_COLOR = 0xffffff; // 골포스트/크로스바 색
export const GOAL_COOLDOWN_MS = 1000; // 득점 후 재판정 방지

// 네트워크 (온라인 1v1)
export const SNAPSHOT_HZ = 30; // host→guest 상태 스냅샷 전송 빈도
// (기존 20Hz는 헤딩처럼 급격한 반동 구간에서 guest의 선형 보간이 캐릭터를
//  '뚫고 지나가는' 것처럼 보이는 원인 중 하나였다 — 간격을 좁혀 완화)
export const INPUT_HZ = 30; // guest→host 입력 전송 빈도
export const INTERP_DELAY_MS = 100; // guest 보간 렌더 지연(과거 시점 렌더)
export const ROOM_CODE_LENGTH = 4;
// 혼동 문자(0/O, 1/I) 제외한 대문자+숫자
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// 경기 시간
export const MATCH_DURATION_MS = 90_000; // 90초
