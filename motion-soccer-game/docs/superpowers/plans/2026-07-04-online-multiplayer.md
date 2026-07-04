# 온라인 1v1 멀티플레이어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 로컬 단일 플레이어 축구 게임을, 방 코드/초대 링크로 두 유저가 온라인 1v1을 하는 게임으로 확장한다.

**Architecture:** Host-authoritative relay. Host 브라우저가 기존 Phaser Arcade 시뮬을 권위 있게 실행하고, guest는 host 스냅샷을 보간 렌더하며 자기 입력만 전송한다. 전송 계층은 Supabase Realtime Broadcast 채널(서버 코드 0줄). 네트워크 동기화 로직은 Phaser에 의존하지 않는 순수 함수/클래스로 분리해 in-memory fake channel로 테스트한다.

**Tech Stack:** TypeScript, Vite, Phaser 3.80 (Arcade physics), @mediapipe/tasks-vision, @supabase/supabase-js, vitest.

## Global Constraints

- TypeScript strict 모드 (`tsconfig.json`의 `strict`, `noUnusedLocals`, `noUnusedParameters` 유지) — 미사용 변수/파라미터 금지.
- 모든 주석·UI 문구는 한국어, 기술 용어는 영어 (기존 코드 스타일).
- `import` 확장자는 붙이지 않는다 (기존 코드가 `../../config` 형태 사용). `allowImportingTsExtensions`는 켜져 있으나 기존 패턴을 따른다.
- net 계층은 Supabase를 격리한다 — `src/game/**`, `src/net/RoomSession.ts` 등 상위 코드는 `@supabase/supabase-js`를 직접 import하지 않고 `NetChannel` 인터페이스만 사용한다.
- Supabase 자격증명은 `.env`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`로만 주입. 하드코딩 금지. `.env`는 `.gitignore`에 포함.
- 네트워크 동기화 로직(스냅샷 생성/보간/적용)은 Phaser 객체가 아니라 plain 숫자/객체를 다루어 vitest로 검증 가능하게 유지한다.

---

## File Structure

**신규:**
- `src/net/protocol.ts` — 메시지 타입(`Snapshot`, `GuestInput`, `MatchEvent`) + 타입 가드 + 스냅샷 생성 헬퍼
- `src/net/roomCode.ts` — 방 코드 생성/정규화
- `src/net/Interpolator.ts` — 스냅샷 버퍼 + 보간 sampling
- `src/net/NetChannel.ts` — `NetChannel` 인터페이스 + `FakeChannel`(테스트용 in-memory) + `FakeHub`
- `src/net/SupabaseChannel.ts` — `NetChannel`의 Supabase Realtime 구현
- `src/net/supabaseClient.ts` — Supabase client 싱글턴 (env 주입)
- `src/net/RoomSession.ts` — 방 생성/입장, presence 준비 감지, role 배정, match_start handshake
- `src/game/scenes/HomeScene.ts` — 방 만들기/코드 입장 UI + 초대 링크
- 테스트: `src/net/*.test.ts` (vitest)
- `.env.example` — 자격증명 템플릿

**수정:**
- `package.json` — deps + `test` 스크립트
- `vite.config.ts` — vitest 설정
- `.gitignore` — `.env` 추가
- `src/config.ts` — net 상수 추가
- `src/game/scenes/PlayScene.ts` — 2인 플레이어 + role(host/guest/local) + snapshot 송수신
- `src/main.ts` — HomeScene 우선 시작 + `?room=` 처리

---

## Task 1: 툴링 셋업 (vitest + Supabase deps + env + config 상수)

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `.gitignore`
- Create: `.env.example`
- Modify: `src/config.ts`
- Create: `src/net/roomCode.ts`
- Test: `src/net/roomCode.test.ts`

**Interfaces:**
- Produces: `generateRoomCode(): string`, `normalizeRoomCode(raw: string): string` in `src/net/roomCode.ts`
- Produces: config 상수 `SNAPSHOT_HZ`, `INPUT_HZ`, `INTERP_DELAY_MS`, `ROOM_CODE_LENGTH`, `ROOM_CODE_ALPHABET`

- [ ] **Step 1: 의존성 설치**

```bash
cd /Users/yoojin/dev/1v1-soccer-game/motion-soccer-game
yarn add @supabase/supabase-js
yarn add -D vitest
```

- [ ] **Step 2: `package.json`에 test 스크립트 추가**

`scripts`에 다음을 추가:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: `vite.config.ts`에 vitest 설정 추가**

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    open: false,
  },
  build: {
    target: "es2020",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: `.gitignore`에 `.env` 추가**

기존 `.gitignore` 끝에 다음 줄 추가 (이미 있으면 생략):

```
.env
.env.local
```

- [ ] **Step 5: `.env.example` 생성**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 6: `src/config.ts` 끝에 net 상수 추가**

```typescript

// 네트워크 (온라인 1v1)
export const SNAPSHOT_HZ = 20; // host→guest 상태 스냅샷 전송 빈도
export const INPUT_HZ = 30; // guest→host 입력 전송 빈도
export const INTERP_DELAY_MS = 100; // guest 보간 렌더 지연(과거 시점 렌더)
export const ROOM_CODE_LENGTH = 4;
// 혼동 문자(0/O, 1/I) 제외한 대문자+숫자
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
```

- [ ] **Step 7: 실패 테스트 작성 — `src/net/roomCode.test.ts`**

```typescript
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
```

- [ ] **Step 8: 테스트 실패 확인**

Run: `yarn test src/net/roomCode.test.ts`
Expected: FAIL — `roomCode` 모듈이 없음

- [ ] **Step 9: 구현 — `src/net/roomCode.ts`**

```typescript
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
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `yarn test src/net/roomCode.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 11: 커밋**

```bash
git add package.json yarn.lock vite.config.ts .gitignore .env.example src/config.ts src/net/roomCode.ts src/net/roomCode.test.ts
git commit -m "chore: vitest·supabase 셋업 + net 상수 + 방 코드 생성"
```

---

## Task 2: 메시지 프로토콜 (`protocol.ts`)

**Files:**
- Create: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Produces (types):
  - `EntityState = { x: number; y: number; vx: number; vy: number; facing: number }`
  - `BallState = { x: number; y: number; vx: number; vy: number }`
  - `MatchPhase = "playing" | "ended"`
  - `Snapshot = { t: number; p1: EntityState; p2: EntityState; ball: BallState; scoreL: number; scoreR: number; clockMs: number; phase: MatchPhase }`
  - `GuestInput = { seq: number; moveLeft: boolean; moveRight: boolean; jump: boolean }`
  - `MatchEvent = { kind: "matchStart" | "goal" | "matchEnd" | "pause" | "resume"; scoreL?: number; scoreR?: number; winner?: "left" | "right" | "draw" }`
  - `NetEvent` 상수: `EV_SNAPSHOT = "snapshot"`, `EV_INPUT = "guest_input"`, `EV_MATCH = "event"`
- Produces (guards): `isSnapshot(v: unknown): v is Snapshot`, `isGuestInput(v: unknown): v is GuestInput`, `isMatchEvent(v: unknown): v is MatchEvent`

- [ ] **Step 1: 실패 테스트 작성 — `src/net/protocol.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { isSnapshot, isGuestInput, isMatchEvent, type Snapshot } from "./protocol";

const validSnapshot: Snapshot = {
  t: 1000,
  p1: { x: 1, y: 2, vx: 0, vy: 0, facing: 1 },
  p2: { x: 3, y: 4, vx: 0, vy: 0, facing: -1 },
  ball: { x: 5, y: 6, vx: 0, vy: 0 },
  scoreL: 0,
  scoreR: 0,
  clockMs: 120000,
  phase: "playing",
};

describe("protocol guards", () => {
  it("유효한 Snapshot을 통과시킨다", () => {
    expect(isSnapshot(validSnapshot)).toBe(true);
  });

  it("필드가 빠진 Snapshot을 거부한다", () => {
    const { ball: _ball, ...broken } = validSnapshot;
    expect(isSnapshot(broken)).toBe(false);
  });

  it("null/원시값을 거부한다", () => {
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot(42)).toBe(false);
  });

  it("유효한 GuestInput을 통과시킨다", () => {
    expect(isGuestInput({ seq: 1, moveLeft: true, moveRight: false, jump: false })).toBe(true);
  });

  it("타입이 틀린 GuestInput을 거부한다", () => {
    expect(isGuestInput({ seq: "1", moveLeft: true, moveRight: false, jump: false })).toBe(false);
  });

  it("유효한 MatchEvent를 통과시킨다", () => {
    expect(isMatchEvent({ kind: "matchStart" })).toBe(true);
    expect(isMatchEvent({ kind: "matchEnd", winner: "left" })).toBe(true);
  });

  it("알 수 없는 kind를 거부한다", () => {
    expect(isMatchEvent({ kind: "nope" })).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test src/net/protocol.test.ts`
Expected: FAIL — `protocol` 모듈 없음

- [ ] **Step 3: 구현 — `src/net/protocol.ts`**

```typescript
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

const MATCH_KINDS = ["matchStart", "goal", "matchEnd", "pause", "resume"];
export function isMatchEvent(v: unknown): v is MatchEvent {
  return isRecord(v) && typeof v.kind === "string" && MATCH_KINDS.includes(v.kind);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test src/net/protocol.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/net/protocol.ts src/net/protocol.test.ts
git commit -m "feat: net 메시지 프로토콜 타입 + 타입 가드"
```

---

## Task 3: 스냅샷 보간기 (`Interpolator.ts`)

**Files:**
- Create: `src/net/Interpolator.ts`
- Test: `src/net/Interpolator.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `EntityState`, `BallState` from `./protocol`
- Produces: `class Interpolator` with:
  - `push(s: Snapshot): void`
  - `sample(renderT: number): Snapshot | null` — `renderT` 시점의 두 스냅샷을 선형 보간해 반환. 스냅샷이 없으면 null, 하나뿐이면 그것을 반환.
  - `get latest(): Snapshot | null`

- [ ] **Step 1: 실패 테스트 작성 — `src/net/Interpolator.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { Interpolator } from "./Interpolator";
import type { Snapshot } from "./protocol";

function snap(t: number, ballX: number): Snapshot {
  return {
    t,
    p1: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 },
    p2: { x: 0, y: 0, vx: 0, vy: 0, facing: -1 },
    ball: { x: ballX, y: 0, vx: 0, vy: 0 },
    scoreL: 0,
    scoreR: 0,
    clockMs: 0,
    phase: "playing",
  };
}

describe("Interpolator", () => {
  it("스냅샷이 없으면 null", () => {
    expect(new Interpolator().sample(0)).toBeNull();
  });

  it("스냅샷이 하나뿐이면 그것을 반환", () => {
    const it_ = new Interpolator();
    it_.push(snap(100, 10));
    expect(it_.sample(200)?.ball.x).toBe(10);
  });

  it("두 스냅샷 사이를 선형 보간한다", () => {
    const it_ = new Interpolator();
    it_.push(snap(0, 0));
    it_.push(snap(100, 100));
    // renderT=50 → 중간값 50
    expect(it_.sample(50)?.ball.x).toBeCloseTo(50);
    // renderT=25 → 25
    expect(it_.sample(25)?.ball.x).toBeCloseTo(25);
  });

  it("renderT가 최신 스냅샷보다 뒤면 최신값으로 clamp", () => {
    const it_ = new Interpolator();
    it_.push(snap(0, 0));
    it_.push(snap(100, 100));
    expect(it_.sample(200)?.ball.x).toBeCloseTo(100);
  });

  it("renderT가 가장 오래된 스냅샷보다 앞이면 가장 오래된 값", () => {
    const it_ = new Interpolator();
    it_.push(snap(100, 10));
    it_.push(snap(200, 20));
    expect(it_.sample(50)?.ball.x).toBeCloseTo(10);
  });

  it("scoreL/phase 같은 이산 필드는 보간하지 않고 앞 스냅샷 값을 쓴다", () => {
    const it_ = new Interpolator();
    const a = snap(0, 0);
    const b = { ...snap(100, 100), scoreL: 1, phase: "ended" as const };
    it_.push(a);
    it_.push(b);
    const s = it_.sample(50);
    expect(s?.scoreL).toBe(0);
    expect(s?.phase).toBe("playing");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test src/net/Interpolator.test.ts`
Expected: FAIL — `Interpolator` 없음

- [ ] **Step 3: 구현 — `src/net/Interpolator.ts`**

```typescript
import type { Snapshot, EntityState, BallState } from "./protocol";

const BUFFER_MAX = 12; // 오래된 스냅샷은 버린다

// guest 렌더용 스냅샷 보간기.
// push로 host 스냅샷을 쌓고, sample(renderT)로 그 시점의 위치를 선형 보간해 얻는다.
// 위치/속도만 보간하고 점수·phase 같은 이산 필드는 앞(older) 스냅샷 값을 사용한다.
export class Interpolator {
  private buffer: Snapshot[] = []; // t 오름차순

  push(s: Snapshot): void {
    this.buffer.push(s);
    this.buffer.sort((a, b) => a.t - b.t);
    if (this.buffer.length > BUFFER_MAX) {
      this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    }
  }

  get latest(): Snapshot | null {
    return this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
  }

  sample(renderT: number): Snapshot | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    const first = this.buffer[0];
    const last = this.buffer[this.buffer.length - 1];
    if (renderT <= first.t) return first;
    if (renderT >= last.t) return last;

    // renderT를 감싸는 두 스냅샷 [a, b] 찾기
    let a = first;
    let b = last;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].t <= renderT && renderT <= this.buffer[i + 1].t) {
        a = this.buffer[i];
        b = this.buffer[i + 1];
        break;
      }
    }

    const span = b.t - a.t;
    const alpha = span > 0 ? (renderT - a.t) / span : 0;

    return {
      t: renderT,
      p1: lerpEntity(a.p1, b.p1, alpha),
      p2: lerpEntity(a.p2, b.p2, alpha),
      ball: lerpBall(a.ball, b.ball, alpha),
      // 이산 필드: 앞 스냅샷 값 유지
      scoreL: a.scoreL,
      scoreR: a.scoreR,
      clockMs: a.clockMs,
      phase: a.phase,
    };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpEntity(a: EntityState, b: EntityState, t: number): EntityState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
    facing: t < 0.5 ? a.facing : b.facing,
  };
}

function lerpBall(a: BallState, b: BallState, t: number): BallState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    vx: lerp(a.vx, b.vx, t),
    vy: lerp(a.vy, b.vy, t),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test src/net/Interpolator.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/net/Interpolator.ts src/net/Interpolator.test.ts
git commit -m "feat: guest 렌더용 스냅샷 보간기"
```

---

## Task 4: NetChannel 인터페이스 + in-memory FakeChannel

**Files:**
- Create: `src/net/NetChannel.ts`
- Test: `src/net/NetChannel.test.ts`

**Interfaces:**
- Produces:
  - `interface NetChannel { send(event: string, payload: unknown): void; on(event: string, cb: (payload: unknown) => void): void; onPresenceChange(cb: (count: number) => void): void; join(): Promise<void>; leave(): Promise<void>; }`
  - `class FakeHub` — 여러 FakeChannel을 묶어 같은 방을 시뮬레이트. `channel(clientId: string): FakeChannel`
  - `class FakeChannel implements NetChannel` — 같은 hub의 다른 채널로 메시지를 즉시 전달(자기 자신 제외), presence는 hub에 join한 채널 수를 알림.

- [ ] **Step 1: 실패 테스트 작성 — `src/net/NetChannel.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { FakeHub } from "./NetChannel";

describe("FakeChannel", () => {
  it("보낸 메시지는 다른 채널이 받고 자신은 받지 않는다", async () => {
    const hub = new FakeHub();
    const host = hub.channel("host");
    const guest = hub.channel("guest");

    const guestGot = vi.fn();
    const hostGot = vi.fn();
    guest.on("ping", guestGot);
    host.on("ping", hostGot);
    await host.join();
    await guest.join();

    host.send("ping", { n: 1 });

    expect(guestGot).toHaveBeenCalledWith({ n: 1 });
    expect(hostGot).not.toHaveBeenCalled();
  });

  it("presence는 join한 채널 수를 알린다", async () => {
    const hub = new FakeHub();
    const host = hub.channel("host");
    const guest = hub.channel("guest");
    const counts: number[] = [];
    host.onPresenceChange((c) => counts.push(c));

    await host.join(); // 1
    await guest.join(); // 2
    await guest.leave(); // 1

    expect(counts).toEqual([1, 2, 1]);
  });

  it("이벤트별로 콜백이 구분된다", async () => {
    const hub = new FakeHub();
    const a = hub.channel("a");
    const b = hub.channel("b");
    const onFoo = vi.fn();
    b.on("foo", onFoo);
    await a.join();
    await b.join();

    a.send("bar", {});
    expect(onFoo).not.toHaveBeenCalled();
    a.send("foo", { ok: true });
    expect(onFoo).toHaveBeenCalledWith({ ok: true });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test src/net/NetChannel.test.ts`
Expected: FAIL — `NetChannel` 없음

- [ ] **Step 3: 구현 — `src/net/NetChannel.ts`**

```typescript
// 전송 계층 추상화. 게임/방 로직은 이 인터페이스만 알고 Supabase는 모른다.
// 프로덕션은 SupabaseChannel, 테스트는 FakeChannel을 주입한다.
export interface NetChannel {
  send(event: string, payload: unknown): void;
  on(event: string, cb: (payload: unknown) => void): void;
  onPresenceChange(cb: (count: number) => void): void;
  join(): Promise<void>;
  leave(): Promise<void>;
}

// 테스트용: 같은 hub에 붙은 채널들끼리 메시지를 즉시(동기) 주고받는다.
export class FakeHub {
  private channels = new Set<FakeChannel>();

  channel(id: string): FakeChannel {
    return new FakeChannel(this, id);
  }

  // 내부용 — FakeChannel이 호출
  _register(ch: FakeChannel): void {
    this.channels.add(ch);
    this._broadcastPresence();
  }
  _unregister(ch: FakeChannel): void {
    this.channels.delete(ch);
    this._broadcastPresence();
  }
  _deliver(from: FakeChannel, event: string, payload: unknown): void {
    for (const ch of this.channels) {
      if (ch !== from) ch._receive(event, payload);
    }
  }
  private _broadcastPresence(): void {
    const count = this.channels.size;
    for (const ch of this.channels) ch._presence(count);
  }
}

export class FakeChannel implements NetChannel {
  private handlers = new Map<string, ((payload: unknown) => void)[]>();
  private presenceCb: ((count: number) => void) | null = null;
  private joined = false;

  constructor(private hub: FakeHub, public readonly id: string) {}

  send(event: string, payload: unknown): void {
    this.hub._deliver(this, event, payload);
  }
  on(event: string, cb: (payload: unknown) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
  }
  onPresenceChange(cb: (count: number) => void): void {
    this.presenceCb = cb;
  }
  async join(): Promise<void> {
    if (this.joined) return;
    this.joined = true;
    this.hub._register(this);
  }
  async leave(): Promise<void> {
    if (!this.joined) return;
    this.joined = false;
    this.hub._unregister(this);
  }

  // hub 내부용
  _receive(event: string, payload: unknown): void {
    for (const cb of this.handlers.get(event) ?? []) cb(payload);
  }
  _presence(count: number): void {
    this.presenceCb?.(count);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test src/net/NetChannel.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/net/NetChannel.ts src/net/NetChannel.test.ts
git commit -m "feat: NetChannel 인터페이스 + 테스트용 FakeChannel/FakeHub"
```

---

## Task 5: Supabase client + SupabaseChannel 구현

이 태스크는 실제 Supabase에 의존해 자동 테스트가 어렵다. 타입 체크(`yarn build`)와 수동 스모크로 검증한다. `NetChannel` 인터페이스를 정확히 구현하는 것이 목표.

**Files:**
- Create: `src/net/supabaseClient.ts`
- Create: `src/net/SupabaseChannel.ts`

**Interfaces:**
- Consumes: `NetChannel` from `./NetChannel`
- Produces: `getSupabase()` (client 싱글턴), `class SupabaseChannel implements NetChannel`, `createSupabaseChannel(roomCode: string): SupabaseChannel`

- [ ] **Step 1: 구현 — `src/net/supabaseClient.ts`**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// env에서 자격증명을 읽어 Supabase client 싱글턴을 만든다.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정 필요."
    );
  }
  client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 40 } },
  });
  return client;
}
```

- [ ] **Step 2: 구현 — `src/net/SupabaseChannel.ts`**

```typescript
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { NetChannel } from "./NetChannel";
import { getSupabase } from "./supabaseClient";

// NetChannel의 Supabase Realtime Broadcast 구현.
// 방 = 채널 `room:{code}`. broadcast로 메시지, presence로 인원 수 추적.
export class SupabaseChannel implements NetChannel {
  private channel: RealtimeChannel;
  private presenceCb: ((count: number) => void) | null = null;
  private clientId = Math.random().toString(36).slice(2);

  constructor(roomCode: string) {
    const supabase = getSupabase();
    this.channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.clientId },
      },
    });
  }

  send(event: string, payload: unknown): void {
    // broadcast는 payload를 { type, event, payload }로 감싼다.
    void this.channel.send({ type: "broadcast", event, payload });
  }

  on(event: string, cb: (payload: unknown) => void): void {
    this.channel.on("broadcast", { event }, (msg) => cb(msg.payload));
  }

  onPresenceChange(cb: (count: number) => void): void {
    this.presenceCb = cb;
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState();
      this.presenceCb?.(Object.keys(state).length);
    });
  }

  async join(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void this.channel.track({ id: this.clientId });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`채널 연결 실패: ${status}`));
        }
      });
    });
  }

  async leave(): Promise<void> {
    await this.channel.unsubscribe();
  }
}

export function createSupabaseChannel(roomCode: string): SupabaseChannel {
  return new SupabaseChannel(roomCode);
}
```

- [ ] **Step 3: 타입 체크**

Run: `yarn build`
Expected: 타입 에러 없이 완료 (기존 PlayScene은 아직 미수정이라 통과해야 함)

- [ ] **Step 4: 커밋**

```bash
git add src/net/supabaseClient.ts src/net/SupabaseChannel.ts
git commit -m "feat: Supabase Realtime broadcast 기반 NetChannel 구현"
```

---

## Task 6: RoomSession (방 생성/입장 · role 배정 · handshake)

**Files:**
- Create: `src/net/RoomSession.ts`
- Test: `src/net/RoomSession.test.ts`

**Interfaces:**
- Consumes: `NetChannel` from `./NetChannel`, `EV_MATCH`, `isMatchEvent` from `./protocol`
- Produces:
  - `type Role = "host" | "guest"`
  - `class RoomSession` with:
    - `constructor(channel: NetChannel, role: Role)`
    - `get role(): Role`
    - `onReady(cb: () => void): void` — 양쪽(2명)이 모여 host가 matchStart를 보내면 호출됨
    - `start(): Promise<void>` — join 후, host면 상대 입장 시 matchStart 전송, guest면 matchStart 수신 대기
    - `get channel(): NetChannel`

  role 배정 규칙: 방을 만든 쪽이 `host`, 링크/코드로 들어온 쪽이 `guest` (HomeScene이 결정해 넘긴다).

- [ ] **Step 1: 실패 테스트 작성 — `src/net/RoomSession.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { FakeHub } from "./NetChannel";
import { RoomSession } from "./RoomSession";

describe("RoomSession", () => {
  it("양쪽이 모이면 host/guest 모두 ready가 된다", async () => {
    const hub = new FakeHub();
    const host = new RoomSession(hub.channel("host"), "host");
    const guest = new RoomSession(hub.channel("guest"), "guest");

    const hostReady = vi.fn();
    const guestReady = vi.fn();
    host.onReady(hostReady);
    guest.onReady(guestReady);

    await host.start(); // 아직 혼자 → ready 아님
    expect(hostReady).not.toHaveBeenCalled();

    await guest.start(); // 2명 → host가 matchStart 전송
    expect(hostReady).toHaveBeenCalledTimes(1);
    expect(guestReady).toHaveBeenCalledTimes(1);
  });

  it("role을 노출한다", () => {
    const hub = new FakeHub();
    expect(new RoomSession(hub.channel("h"), "host").role).toBe("host");
    expect(new RoomSession(hub.channel("g"), "guest").role).toBe("guest");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test src/net/RoomSession.test.ts`
Expected: FAIL — `RoomSession` 없음

- [ ] **Step 3: 구현 — `src/net/RoomSession.ts`**

```typescript
import type { NetChannel } from "./NetChannel";
import { EV_MATCH, isMatchEvent } from "./protocol";

export type Role = "host" | "guest";

// 방 세션: presence로 양쪽 입장을 감지하고, host가 matchStart를 보내면 양쪽 ready.
// role은 HomeScene이 결정한다(방 생성=host, 코드 입장=guest).
export class RoomSession {
  private readyCb: (() => void) | null = null;
  private started = false;

  constructor(private ch: NetChannel, public readonly role: Role) {}

  get channel(): NetChannel {
    return this.ch;
  }

  onReady(cb: () => void): void {
    this.readyCb = cb;
  }

  async start(): Promise<void> {
    // guest: host의 matchStart를 기다린다.
    if (this.role === "guest") {
      this.ch.on(EV_MATCH, (payload) => {
        if (isMatchEvent(payload) && payload.kind === "matchStart") {
          this.fireReady();
        }
      });
    }

    // host: 2명이 모이면 matchStart를 보내고 자신도 ready.
    if (this.role === "host") {
      this.ch.onPresenceChange((count) => {
        if (count >= 2 && !this.started) {
          this.ch.send(EV_MATCH, { kind: "matchStart" });
          this.fireReady();
        }
      });
    }

    await this.ch.join();
  }

  private fireReady(): void {
    if (this.started) return;
    this.started = true;
    this.readyCb?.();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test src/net/RoomSession.test.ts`
Expected: PASS (2 tests)

> 참고: FakeChannel의 presence는 join 시점에 동기 통지되므로, host가 guest보다 먼저 join한 뒤 guest.join()이 count=2를 유발해 matchStart가 host→guest로 전달된다. guest는 이미 `on(EV_MATCH)`를 start()에서 등록했으므로 수신된다.

- [ ] **Step 5: 커밋**

```bash
git add src/net/RoomSession.ts src/net/RoomSession.test.ts
git commit -m "feat: RoomSession — presence 기반 ready + matchStart handshake"
```

---

## Task 7: 순수 동기화 로직 (snapshot 생성 · guest 상태 적용)

PlayScene이 Phaser 스프라이트를 다루기 전에, 네트워크 동기화의 핵심을 Phaser 비의존 순수 함수로 분리해 테스트한다. PlayScene은 이 함수들에 스프라이트 값을 넘겨 쓰기만 한다.

**Files:**
- Create: `src/net/sync.ts`
- Test: `src/net/sync.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `EntityState`, `BallState`, `GuestInput` from `./protocol`; `Interpolator` from `./Interpolator`; `InputState` from `../input/InputState`
- Produces:
  - `interface WorldReadout { p1: EntityState; p2: EntityState; ball: BallState; scoreL: number; scoreR: number; clockMs: number; phase: "playing" | "ended" }` — host가 스프라이트에서 읽어 넘기는 값
  - `buildSnapshot(w: WorldReadout, t: number): Snapshot`
  - `inputToMessage(input: InputState, seq: number): GuestInput`
  - `messageToInput(msg: GuestInput): InputState`
  - `class GuestView` — Interpolator를 감싸 `push(s: Snapshot)`, `sample(renderT: number): Snapshot | null` 제공 (PlayScene guest가 사용; 얇은 위임이지만 향후 예측 추가 지점)

- [ ] **Step 1: 실패 테스트 작성 — `src/net/sync.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildSnapshot, inputToMessage, messageToInput, type WorldReadout } from "./sync";

const world: WorldReadout = {
  p1: { x: 10, y: 20, vx: 1, vy: 2, facing: 1 },
  p2: { x: 30, y: 40, vx: 3, vy: 4, facing: -1 },
  ball: { x: 50, y: 60, vx: 5, vy: 6 },
  scoreL: 1,
  scoreR: 2,
  clockMs: 90000,
  phase: "playing",
};

describe("sync", () => {
  it("buildSnapshot은 world와 t를 스냅샷으로 옮긴다", () => {
    const s = buildSnapshot(world, 1234);
    expect(s.t).toBe(1234);
    expect(s.p1).toEqual(world.p1);
    expect(s.ball.x).toBe(50);
    expect(s.scoreL).toBe(1);
    expect(s.phase).toBe("playing");
  });

  it("input↔message 왕복이 보존된다", () => {
    const msg = inputToMessage({ moveLeft: true, moveRight: false, jump: true }, 7);
    expect(msg).toEqual({ seq: 7, moveLeft: true, moveRight: false, jump: true });
    const back = messageToInput(msg);
    expect(back).toEqual({ moveLeft: true, moveRight: false, jump: true });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test src/net/sync.test.ts`
Expected: FAIL — `sync` 없음

- [ ] **Step 3: 구현 — `src/net/sync.ts`**

```typescript
import type { Snapshot, EntityState, BallState, GuestInput } from "./protocol";
import type { InputState } from "../input/InputState";
import { Interpolator } from "./Interpolator";

// host가 매 스냅샷마다 스프라이트/게임 상태에서 읽어 채우는 값.
export interface WorldReadout {
  p1: EntityState;
  p2: EntityState;
  ball: BallState;
  scoreL: number;
  scoreR: number;
  clockMs: number;
  phase: "playing" | "ended";
}

export function buildSnapshot(w: WorldReadout, t: number): Snapshot {
  return {
    t,
    p1: w.p1,
    p2: w.p2,
    ball: w.ball,
    scoreL: w.scoreL,
    scoreR: w.scoreR,
    clockMs: w.clockMs,
    phase: w.phase,
  };
}

export function inputToMessage(input: InputState, seq: number): GuestInput {
  return {
    seq,
    moveLeft: input.moveLeft,
    moveRight: input.moveRight,
    jump: input.jump,
  };
}

export function messageToInput(msg: GuestInput): InputState {
  return { moveLeft: msg.moveLeft, moveRight: msg.moveRight, jump: msg.jump };
}

// guest 렌더 상태. 현재는 Interpolator에 얇게 위임하며,
// 향후 로컬 예측을 붙일 경우의 확장 지점이다.
export class GuestView {
  private interp = new Interpolator();

  push(s: Snapshot): void {
    this.interp.push(s);
  }
  sample(renderT: number): Snapshot | null {
    return this.interp.sample(renderT);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test src/net/sync.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: host→guest 통합 테스트 추가 (fake channel + 보간 수렴)**

`src/net/sync.test.ts` 하단에 추가:

```typescript
import { FakeHub } from "./NetChannel";
import { GuestView } from "./sync";
import { EV_SNAPSHOT } from "./protocol";
import { isSnapshot } from "./protocol";

describe("host→guest 동기화 (fake channel)", () => {
  it("host가 보낸 스냅샷을 guest가 받아 보간 렌더에 반영한다", async () => {
    const hub = new FakeHub();
    const hostCh = hub.channel("host");
    const guestCh = hub.channel("guest");

    const view = new GuestView();
    guestCh.on(EV_SNAPSHOT, (p) => {
      if (isSnapshot(p)) view.push(p);
    });
    await hostCh.join();
    await guestCh.join();

    // host가 공을 x=0→100으로 이동시키며 두 스냅샷 전송
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 0, y: 0, vx: 0, vy: 0 } }, 0));
    hostCh.send(EV_SNAPSHOT, buildSnapshot({ ...world, ball: { x: 100, y: 0, vx: 0, vy: 0 } }, 100));

    // guest는 t=50 시점 보간값 ≈ 50
    expect(view.sample(50)?.ball.x).toBeCloseTo(50);
  });
});
```

- [ ] **Step 6: 통합 테스트 통과 확인**

Run: `yarn test src/net/sync.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/net/sync.ts src/net/sync.test.ts
git commit -m "feat: 순수 동기화 로직(snapshot 생성/입력 변환/guest view) + 통합 테스트"
```

---

## Task 8: PlayScene 리팩터 — 2인 플레이어 + facing + local 모드 유지

네트워크를 붙이기 전에, 먼저 PlayScene을 플레이어 2명 구조로 리팩터하고 기존 로컬 동작(모션=player1)을 깨지 않는지 확인한다. player2는 이 태스크에서 키보드(WASD)로 임시 조작해 2인 로컬 동작을 눈으로 검증한다(다음 태스크에서 네트워크로 교체).

**Files:**
- Modify: `src/game/entities/Player.ts` (facing 추적 추가)
- Modify: `src/game/scenes/PlayScene.ts`

**Interfaces:**
- Modify `Player`:
  - 생성자에 색 파라미터 추가: `constructor(scene, x, y, color?: number)` (기본값 `PLAYER_COLOR`) — player2 구분용. 텍스처 키를 색별로 분리.
  - `get facing(): number` 추가 (-1/1, 마지막 이동 방향; 초기 1)
  - `applyState(x, y, vx, vy): void` 추가 — guest 렌더용 위치/속도 직접 세팅
- Modify `PlayScene`:
  - `player1`, `player2` 두 인스턴스
  - 두 플레이어 모두 ground/ball과 collide, 서로 collide (명세 2.4.2)

- [ ] **Step 1: `Player.ts` 수정 — 색 파라미터 + facing + applyState**

생성자 시그니처와 텍스처 생성을 색 기준으로 변경하고, facing 추적/적용 메서드를 추가한다. 파일 전체를 다음으로 교체:

```typescript
import Phaser from "phaser";
import type { InputState } from "../../input/InputState";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
} from "../../config";

// 캐릭터: InputState를 받아 좌우 이동·점프를 수행한다.
// 입력 출처(키보드/모션/네트워크)는 알지 못한다 — InputState만 신뢰한다.
export class Player {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  private readonly startX: number;
  private readonly startY: number;
  private _facing = 1; // -1: 왼쪽, 1: 오른쪽

  constructor(scene: Phaser.Scene, x: number, y: number, color: number = PLAYER_COLOR) {
    this.startX = x;
    this.startY = y;

    const texKey = `player-${color.toString(16)}`;
    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color, 1);
      g.fillRoundedRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT, 8);
      g.generateTexture(texKey, PLAYER_WIDTH, PLAYER_HEIGHT);
      g.destroy();
    }

    this.sprite = scene.physics.add.image(x, y, texKey);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setBounce(0);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(1600); // 낙하 속도 상한
  }

  get facing(): number {
    return this._facing;
  }

  update(input: InputState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (input.moveLeft) {
      this.sprite.setVelocityX(-PLAYER_SPEED);
      this._facing = -1;
    } else if (input.moveRight) {
      this.sprite.setVelocityX(PLAYER_SPEED);
      this._facing = 1;
    } else {
      this.sprite.setVelocityX(0);
    }

    if (input.jump && body.blocked.down) {
      this.sprite.setVelocityY(PLAYER_JUMP_VELOCITY);
    }
  }

  // guest 렌더용: host 스냅샷의 위치/속도를 직접 반영(물리 시뮬 없이).
  applyState(x: number, y: number, vx: number, vy: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setVelocity(vx, vy);
    if (vx < -1) this._facing = -1;
    else if (vx > 1) this._facing = 1;
  }

  reset(): void {
    this.sprite.setPosition(this.startX, this.startY);
    this.sprite.setVelocity(0, 0);
  }
}
```

- [ ] **Step 2: `config.ts`에 player2 색 상수 추가**

`PLAYER_COLOR` 아래에 추가:

```typescript
export const PLAYER2_COLOR = 0xff6b6b; // 오른쪽(guest) 플레이어 색
```

- [ ] **Step 3: `PlayScene.ts` 수정 — player2 추가 + 임시 WASD 조작 + 충돌**

`create()`에서 player 생성 부분을 두 명으로 확장한다. `src/game/scenes/PlayScene.ts`의 다음 부분을 수정:

`import` 블록에 `PLAYER2_COLOR` 추가:

```typescript
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  WORLD_WIDTH,
  GROUND_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER2_COLOR,
  GOAL_COOLDOWN_MS,
} from "../../config";
```

필드 선언에서 `player`를 두 개로:

```typescript
  private player1!: Player;
  private player2!: Player;
```

`create()`의 player/ball 생성부를 교체:

```typescript
    this.player1 = new Player(this, WORLD_WIDTH * 0.5 - 120, groundTop - PLAYER_HEIGHT);
    this.player2 = new Player(this, WORLD_WIDTH * 0.5 + 120, groundTop - PLAYER_HEIGHT, PLAYER2_COLOR);
    this.ball = new Ball(this, WORLD_WIDTH * 0.5, groundTop - 200);
```

충돌 설정을 두 플레이어로 확장 (기존 collider 블록 교체):

```typescript
    for (const p of [this.player1, this.player2]) {
      this.physics.add.collider(p.sprite, this.field.ground);
      this.physics.add.collider(p.sprite, this.ball.sprite, () => {
        const body = p.sprite.body as Phaser.Physics.Arcade.Body;
        this.ball.kick(p.sprite.x, body.velocity.x);
      });
    }
    this.physics.add.collider(this.ball.sprite, this.field.ground);
    // 캐릭터 간 충돌 (명세 2.4.2)
    this.physics.add.collider(this.player1.sprite, this.player2.sprite);
```

임시 player2 키보드(WASD) 폴백을 위해 `create()`에 키 등록 추가:

```typescript
    this.wasd = keyboard.addKeys("W,A,D") as Record<string, Phaser.Input.Keyboard.Key>;
```

필드 선언에 추가:

```typescript
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
```

`update()`에서 두 플레이어를 각각 갱신 (기존 `this.player.update(input)` 교체):

```typescript
    this.player1.update(this.resolveInput(now));
    this.player2.update(this.readWasd());
```

`readWasd()` 메서드 추가:

```typescript
  // 임시: player2 로컬 조작(다음 태스크에서 네트워크 입력으로 교체)
  private readWasd(): InputState {
    const input = createEmptyInputState();
    input.moveLeft = this.wasd.A.isDown;
    input.moveRight = this.wasd.D.isDown;
    input.jump = Phaser.Input.Keyboard.JustDown(this.wasd.W);
    return input;
  }
```

`onGoal()`과 리셋에서 `this.player.reset()`을 두 플레이어로:

```typescript
    this.player1.reset();
    this.player2.reset();
```

- [ ] **Step 4: 타입 체크**

Run: `yarn build`
Expected: 타입 에러 없음

- [ ] **Step 5: 수동 검증 — 2인 로컬 플레이**

Run: `yarn dev`
브라우저에서 확인:
- 파란 player1(← → ↑ 또는 모션)과 빨간 player2(A D W)가 독립적으로 움직인다
- 두 캐릭터가 서로 부딪히면 밀린다
- 둘 다 공을 찰 수 있고 골이 들어간다

- [ ] **Step 6: 커밋**

```bash
git add src/game/entities/Player.ts src/config.ts src/game/scenes/PlayScene.ts
git commit -m "refactor: PlayScene 2인 플레이어 구조 + facing/applyState + 캐릭터 충돌"
```

---

## Task 9: PlayScene에 네트워크 연결 — host/guest 모드

이제 임시 WASD를 실제 네트워크로 교체한다. PlayScene은 `init(data)`로 `RoomSession`을 받아 role에 따라 다르게 동작한다. RoomSession 없이 시작하면 `local` 모드로 기존 단일 동작(모션=player1, WASD=player2)을 유지한다.

**Files:**
- Modify: `src/game/scenes/PlayScene.ts`

**Interfaces:**
- Consumes: `RoomSession`, `Role` from `../../net/RoomSession`; `buildSnapshot`, `messageToInput`, `inputToMessage`, `GuestView`, `WorldReadout` from `../../net/sync`; `EV_SNAPSHOT`, `EV_INPUT`, `isSnapshot`, `isGuestInput` from `../../net/protocol`; `SNAPSHOT_HZ`, `INPUT_HZ`, `INTERP_DELAY_MS` from `../../config`
- Produces: `PlayScene.init(data: { session?: RoomSession })`

**동작 요약:**
- **host**: player1=로컬(모션), player2=수신한 guest 입력. 물리 시뮬 그대로. `SNAPSHOT_HZ` 주기로 `buildSnapshot` → `EV_SNAPSHOT` 전송. 골/점수/시계는 host 권위.
- **guest**: 로컬 입력을 `INPUT_HZ` 주기로 `EV_INPUT` 전송. 물리 시뮬 정지(공·상대 위치는 스냅샷으로 덮어씀). 매 프레임 `GuestView.sample(now - INTERP_DELAY_MS)`로 player1/player2/ball 위치 적용. 점수/시계는 스냅샷 값 표시.
- **local**: 기존 Task 8 동작.

- [ ] **Step 1: `PlayScene.ts`에 mode/네트워크 필드 + import 추가**

import 추가:

```typescript
import { SNAPSHOT_HZ, INPUT_HZ, INTERP_DELAY_MS } from "../../config";
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
import { createEmptyInputState, type InputState } from "../../input/InputState";
```

필드 추가:

```typescript
  private session: RoomSession | null = null;
  private mode: "host" | "guest" | "local" = "local";
  private guestView = new GuestView();
  private remoteInput: InputState = createEmptyInputState();
  private inputSeq = 0;
  private lastSnapshotAt = 0;
  private lastInputSentAt = 0;
```

- [ ] **Step 2: `init()` 추가 + 물리/네트워크 배선**

`constructor` 아래에 `init()` 추가:

```typescript
  init(data: { session?: RoomSession }): void {
    this.session = data.session ?? null;
    this.mode = this.session ? this.session.role : "local";
  }
```

`create()` 끝(모션 시작 근처)에 네트워크 수신 핸들러 등록 추가:

```typescript
    if (this.session) {
      const ch = this.session.channel;
      if (this.mode === "host") {
        // guest 입력 수신 → player2 입력으로 사용
        ch.on(EV_INPUT, (p) => {
          if (isGuestInput(p)) this.remoteInput = messageToInput(p);
        });
      } else if (this.mode === "guest") {
        // host 스냅샷 수신 → 보간 버퍼에 push
        ch.on(EV_SNAPSHOT, (p) => {
          if (isSnapshot(p)) this.guestView.push(p);
        });
        // guest는 로컬 물리 시뮬을 끈다(위치는 스냅샷으로 덮어씀)
        this.physics.world.pause();
      }
    }
```

- [ ] **Step 3: `update()`를 mode별로 분기**

기존 `update()` 본문을 교체:

```typescript
  update(): void {
    const now = performance.now();

    if (this.mode === "guest") {
      this.updateGuest(now);
    } else {
      // host 또는 local
      this.player1.update(this.resolveInput(now));
      const p2Input = this.mode === "host" ? this.remoteInput : this.readWasd();
      this.player2.update(p2Input);

      if (this.mode === "host") this.maybeSendSnapshot(now);
    }

    this.updateStatus();

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.ball.reset();
    }
  }
```

- [ ] **Step 4: host 스냅샷 송신 + guest 갱신 메서드 추가**

`readWasd()` 근처에 추가:

```typescript
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
      clockMs: 0, // 경기 시계는 후속(명세 2.3) — 현재 0
      phase: "playing",
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
    const s = this.guestView.sample(now - INTERP_DELAY_MS);
    if (s) {
      this.player1.applyState(s.p1.x, s.p1.y, s.p1.vx, s.p1.vy);
      this.player2.applyState(s.p2.x, s.p2.y, s.p2.vx, s.p2.vy);
      this.ball.sprite.setPosition(s.ball.x, s.ball.y);
      this.ball.sprite.setVelocity(s.ball.vx, s.ball.vy);
      this.scoreLeft = s.scoreL;
      this.scoreRight = s.scoreR;
      this.updateScoreboard();
    }
  }
```

- [ ] **Step 5: guest에서 골 판정 중복 방지**

`onGoal()` 시작에 guard 추가 (guest는 점수를 스냅샷으로만 받는다):

```typescript
  private onGoal(side: GoalSide): void {
    if (this.mode === "guest") return; // 점수는 host 권위
    const now = this.time.now;
    ...
```

- [ ] **Step 6: 타입 체크**

Run: `yarn build`
Expected: 타입 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/game/scenes/PlayScene.ts
git commit -m "feat: PlayScene host/guest 네트워크 모드 — 스냅샷 송수신·보간 렌더"
```

---

## Task 10: HomeScene + main.ts 배선 (방 만들기/입장 + 초대 링크)

**Files:**
- Create: `src/game/scenes/HomeScene.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `generateRoomCode`, `normalizeRoomCode` from `../../net/roomCode`; `createSupabaseChannel` from `../../net/SupabaseChannel`; `RoomSession` from `../../net/RoomSession`
- Produces: `HomeScene` (key `"Home"`). ready 시 `this.scene.start("Play", { session })`.

**흐름:**
- URL에 `?room=CODE` 있으면 자동으로 guest 입장 절차.
- 없으면 홈 화면: "방 만들기"(host) / 코드 입력 후 "입장"(guest).
- 방 만들기 → 코드 생성 → 초대 링크 표시 → RoomSession(host).start() → onReady → Play.
- 입장 → RoomSession(guest).start() → onReady → Play.

- [ ] **Step 1: 구현 — `src/game/scenes/HomeScene.ts`**

```typescript
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
    const createBtn = this.makeButton("방 만들기", GAME_WIDTH / 2, 200, () => {
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

    const joinBtn = this.makeButton("입장", GAME_WIDTH / 2 + 60, 280, () => {
      const code = normalizeRoomCode(input.value);
      if (code.length === 0) {
        this.info.setText("코드를 입력하세요");
        return;
      }
      this.info.setText(`방 ${code} 입장 중...`);
      this.cleanupDom();
      void this.enterRoom(code, "guest");
    });

    this.dom.push(createBtn, input, joinBtn);
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
    this.styleDom(btn, x - 70, y, 140);
    btn.style.cursor = "pointer";
    btn.onclick = onClick;
    document.body.appendChild(btn);
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
```

> 주의: `styleDom`이 `this.dom`에 push하고 `makeButton`도 push하므로 중복될 수 있다. 구현 시 `makeButton`은 `styleDom` 호출로만 등록되게 하고, 별도 push는 하지 않는다 — 아래 Step 2에서 정리.

- [ ] **Step 2: HomeScene 중복 등록 정리**

`makeButton`에서 `document.body.appendChild(btn)`와 반환 후 별도 push를 제거하고, `styleDom`이 append+push를 전담하도록 한다. `buildLobbyUi`의 `this.dom.push(createBtn, input, joinBtn)`도 제거한다(styleDom이 이미 등록). 최종적으로 각 DOM 요소는 `this.dom`에 정확히 한 번만 들어가야 한다. 수정 후 `makeButton`:

```typescript
  private makeButton(label: string, x: number, y: number, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cursor = "pointer";
    btn.onclick = onClick;
    this.styleDom(btn, x - 70, y, 140);
    return btn;
  }
```

그리고 `buildLobbyUi`에서 `this.dom.push(...)` 줄 삭제.

- [ ] **Step 3: `main.ts` 수정 — HomeScene 우선**

scene 배열을 교체:

```typescript
import { HomeScene } from "./game/scenes/HomeScene";
...
  scene: [HomeScene, PlayScene, MotionDebugScene],
```

`HomeScene` import 추가, 배열 첫 항목으로 배치.

- [ ] **Step 4: `index.html`에 `dom.createContainer` 불필요 확인 + 타입 체크**

DOM 버튼은 `document.body`에 직접 붙이므로 Phaser dom 설정은 불필요.

Run: `yarn build`
Expected: 타입 에러 없음

- [ ] **Step 5: 전체 유닛 테스트 재확인**

Run: `yarn test`
Expected: 모든 테스트 PASS (roomCode 4, protocol 7, Interpolator 6, NetChannel 3, RoomSession 2, sync 3 = 25 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/game/scenes/HomeScene.ts src/main.ts
git commit -m "feat: HomeScene 방 만들기/코드 입장 + 초대 링크 + main 배선"
```

---

## Task 11: 수동 E2E 검증 (두 브라우저 탭)

**Files:** 없음 (검증만)

**전제:** Supabase 프로젝트 생성 후 `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정. Supabase 대시보드에서 Realtime이 활성인지 확인(기본 활성).

- [ ] **Step 1: dev 서버 실행**

Run: `yarn dev`

- [ ] **Step 2: host 탭**

브라우저 탭 A에서 dev URL 접속 → "방 만들기" 클릭 → 방 코드/초대 링크 표시 확인.

- [ ] **Step 3: guest 탭**

탭 B에서 초대 링크(`?room=CODE`) 접속 → 자동 입장 → 양쪽 PlayScene 시작 확인.

- [ ] **Step 4: 동기화 확인**

- host 탭에서 player1(파랑)을 모션/키보드로 움직이면 guest 탭에서도 파랑이 같은 방향으로 움직인다.
- guest 탭에서 자기 캐릭터(빨강)를 움직이면 host 탭 player2가 따라 움직인다.
- 공 위치가 양 탭에서 대체로 일치한다(보간 지연 ~100ms 허용).
- 골이 들어가면 양쪽 점수가 동일하게 오른다.

- [ ] **Step 5: 끊김 확인 (선택)**

guest 탭을 닫으면 host presence count가 줄어드는지(콘솔/동작) 확인. (재연결/일시정지 UI는 이번 범위에서 최소 — 후속 job.)

- [ ] **Step 6: 결과 기록**

검증 결과와 남은 이슈(체감 지연, 공 튐 불일치 등)를 커밋 메시지 또는 후속 이슈로 정리.

---

## Self-Review 결과 (spec 대비 커버리지)

- §3.1 빠른 매칭 큐 → **범위 밖(설계 명시)**. 방 코드/초대 링크로 대체.
- §3.2 친구 초대 링크 생성/공유/참여/상태 → Task 10 (초대 링크 생성·공유·`?room=` 참여), Task 6 (상태/handshake).
- §3.3 실시간 동기화(캐릭터/공/점수/지연 최소화) → Task 3(보간), Task 7·9(스냅샷 송수신). 클라 예측은 범위 밖(설계 명시).
- §3.4 웹소켓 통신 → Supabase Realtime(WebSocket)으로 대체. 재연결/폴백은 Supabase 내장 + 최소 처리(후속).
- §2.4.2 캐릭터 간 충돌 → Task 8.
- §5.1 홈 화면 시작 → Task 10.
- 경기 시계(§2.3) `clockMs`는 스냅샷 필드로 예약했으나 현재 0 — 기존 게임에도 미구현이므로 별도 job. Task 9 `readWorld`에 주석 명시.

**미해결 의존:** Supabase 프로젝트/자격증명은 사용자가 생성해 `.env`에 넣어야 함(Task 11 전제).
