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
