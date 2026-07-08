import { describe, it, expect } from "vitest";
import { RoomHub, type Peer } from "./rooms";

function fakePeer(id: string): Peer & { inbox: unknown[] } {
  const inbox: unknown[] = [];
  return { id, inbox, send: (m) => inbox.push(m) };
}

describe("RoomHub", () => {
  it("두 명이 같은 방에 들어가면 서로 존재를 통지받는다", () => {
    const hub = new RoomHub();
    const a = fakePeer("a");
    const b = fakePeer("b");
    expect(hub.join("R", a).ok).toBe(true);
    expect(hub.join("R", b).ok).toBe(true);
    expect(a.inbox).toContainEqual({ t: "joined", count: 1 });
    expect(a.inbox).toContainEqual({ t: "peer-joined", count: 2 });
    expect(b.inbox).toContainEqual({ t: "joined", count: 2 });
  });

  it("세 번째 입장은 거부된다(full)", () => {
    const hub = new RoomHub();
    hub.join("R", fakePeer("a"));
    hub.join("R", fakePeer("b"));
    const c = hub.join("R", fakePeer("c"));
    expect(c.ok).toBe(false);
    expect(c.reason).toBe("full");
  });

  it("signal은 같은 방의 상대에게만 중계되고 자신에겐 안 온다", () => {
    const hub = new RoomHub();
    const a = fakePeer("a");
    const b = fakePeer("b");
    hub.join("R", a);
    hub.join("R", b);
    a.inbox.length = 0;
    b.inbox.length = 0;
    hub.signal(a, { sdp: "offer" });
    expect(b.inbox).toContainEqual({ t: "signal", payload: { sdp: "offer" } });
    expect(a.inbox).toHaveLength(0);
  });

  it("다른 방끼리는 격리된다", () => {
    const hub = new RoomHub();
    const a = fakePeer("a");
    const b = fakePeer("b");
    hub.join("R1", a);
    hub.join("R2", b);
    b.inbox.length = 0;
    hub.signal(a, { x: 1 });
    expect(b.inbox).toHaveLength(0);
  });

  it("나가면 상대가 peer-left를 받고, 자리가 나 재입장이 가능하다", () => {
    const hub = new RoomHub();
    const a = fakePeer("a");
    const b = fakePeer("b");
    hub.join("R", a);
    hub.join("R", b);
    b.inbox.length = 0;
    hub.leave(a);
    expect(b.inbox).toContainEqual({ t: "peer-left", count: 1 });
    expect(hub.join("R", fakePeer("c")).ok).toBe(true);
  });
});
