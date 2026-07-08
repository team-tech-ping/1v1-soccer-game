import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import type { Server } from "node:http";
import { createSignalingServer } from "./server";

let server: Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
});

function start(): Promise<number> {
  server = createSignalingServer();
  return new Promise((resolve) => {
    server!.listen(0, () => {
      const addr = server!.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

function connect(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  return new Promise((resolve) => ws.on("open", () => resolve(ws)));
}

function next(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    ws.once("message", (d) => resolve(JSON.parse(d.toString())))
  );
}

describe("signaling server (ws)", () => {
  it("A의 signal이 같은 방 B에게 그대로 중계된다", async () => {
    const port = await start();
    const a = await connect(port);
    const b = await connect(port);

    a.send(JSON.stringify({ t: "join", room: "R" }));
    expect(await next(a)).toEqual({ t: "joined", count: 1 });

    b.send(JSON.stringify({ t: "join", room: "R" }));
    expect(await next(b)).toEqual({ t: "joined", count: 2 });
    expect(await next(a)).toEqual({ t: "peer-joined", count: 2 });

    const bMsg = next(b);
    a.send(JSON.stringify({ t: "signal", payload: { sdp: "offer" } }));
    expect(await bMsg).toEqual({ t: "signal", payload: { sdp: "offer" } });

    a.close();
    b.close();
  });

  it("세 번째 연결은 full 에러로 닫힌다", async () => {
    const port = await start();
    const a = await connect(port);
    const b = await connect(port);
    const c = await connect(port);

    a.send(JSON.stringify({ t: "join", room: "R" }));
    await next(a);
    b.send(JSON.stringify({ t: "join", room: "R" }));
    await next(b);

    c.send(JSON.stringify({ t: "join", room: "R" }));
    expect(await next(c)).toEqual({ t: "error", reason: "full" });

    a.close();
    b.close();
    c.close();
  });
});
