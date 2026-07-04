// 네트워크 메시지 타입 + 런타임 타입 가드.
// 게임 코드는 이 타입들만 알면 되고 전송 계층(Supabase/fake)은 모른다.

export interface EntityState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number; // -1: 왼쪽, 1: 오른쪽
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type MatchPhase = "playing" | "ended";

export interface Snapshot {
  t: number; // host 기준 시각(ms)
  p1: EntityState;
  p2: EntityState;
  ball: BallState;
  scoreL: number;
  scoreR: number;
  clockMs: number; // 남은 경기 시간(ms)
  phase: MatchPhase;
}

export interface GuestInput {
  seq: number;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
}

export interface MatchEvent {
  kind: "matchStart" | "goal" | "matchEnd" | "pause" | "resume";
  scoreL?: number;
  scoreR?: number;
  winner?: "left" | "right" | "draw";
}

// Supabase broadcast event 이름
export const EV_SNAPSHOT = "snapshot";
export const EV_INPUT = "guest_input";
export const EV_MATCH = "event";

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isEntity(v: unknown): v is EntityState {
  return isRecord(v) && isNum(v.x) && isNum(v.y) && isNum(v.vx) && isNum(v.vy) && isNum(v.facing);
}
function isBall(v: unknown): v is BallState {
  return isRecord(v) && isNum(v.x) && isNum(v.y) && isNum(v.vx) && isNum(v.vy);
}

export function isSnapshot(v: unknown): v is Snapshot {
  return (
    isRecord(v) &&
    isNum(v.t) &&
    isEntity(v.p1) &&
    isEntity(v.p2) &&
    isBall(v.ball) &&
    isNum(v.scoreL) &&
    isNum(v.scoreR) &&
    isNum(v.clockMs) &&
    (v.phase === "playing" || v.phase === "ended")
  );
}

export function isGuestInput(v: unknown): v is GuestInput {
  return (
    isRecord(v) &&
    isNum(v.seq) &&
    isBool(v.moveLeft) &&
    isBool(v.moveRight) &&
    isBool(v.jump)
  );
}

const MATCH_KINDS = ["matchStart", "goal", "matchEnd", "pause", "resume"] as const;
const MATCH_WINNERS = ["left", "right", "draw"] as const;
export function isMatchEvent(v: unknown): v is MatchEvent {
  return (
    isRecord(v) &&
    typeof v.kind === "string" &&
    (MATCH_KINDS as readonly string[]).includes(v.kind) &&
    (v.scoreL === undefined || isNum(v.scoreL)) &&
    (v.scoreR === undefined || isNum(v.scoreR)) &&
    (v.winner === undefined || (MATCH_WINNERS as readonly unknown[]).includes(v.winner))
  );
}
