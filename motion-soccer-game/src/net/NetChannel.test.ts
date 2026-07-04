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
