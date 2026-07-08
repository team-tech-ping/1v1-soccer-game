// 방(room) 관리 + 시그널링 릴레이.
// ws에 독립적이라(Peer 인터페이스만 의존) 단위 테스트가 쉽다.
// 영상은 여기를 지나지 않는다 — WebRTC 핸드셰이크(offer/answer/ICE)만 상대에게 중계한다.

export interface Peer {
  readonly id: string;
  send(msg: unknown): void;
}

export interface JoinResult {
  ok: boolean;
  reason?: "full";
}

const MAX_PER_ROOM = 2; // 1v1

export class RoomHub {
  private rooms = new Map<string, Set<Peer>>();
  private peerRoom = new Map<Peer, string>();

  join(room: string, peer: Peer): JoinResult {
    let set = this.rooms.get(room);
    if (!set) {
      set = new Set<Peer>();
      this.rooms.set(room, set);
    }
    if (set.size >= MAX_PER_ROOM) {
      return { ok: false, reason: "full" };
    }
    set.add(peer);
    this.peerRoom.set(peer, room);

    // 입장자에게 현재 인원 통지, 기존 상대에게 새 입장 통지.
    peer.send({ t: "joined", count: set.size });
    for (const other of set) {
      if (other !== peer) other.send({ t: "peer-joined", count: set.size });
    }
    return { ok: true };
  }

  // from이 속한 방의 다른 상대에게 payload를 그대로 중계한다.
  signal(from: Peer, payload: unknown): void {
    const room = this.peerRoom.get(from);
    if (!room) return;
    const set = this.rooms.get(room);
    if (!set) return;
    for (const other of set) {
      if (other !== from) other.send({ t: "signal", payload });
    }
  }

  leave(peer: Peer): void {
    const room = this.peerRoom.get(peer);
    if (!room) return;
    this.peerRoom.delete(peer);
    const set = this.rooms.get(room);
    if (!set) return;
    set.delete(peer);
    if (set.size === 0) {
      this.rooms.delete(room); // 빈 방 정리(메모리 누수 방지)
      return;
    }
    for (const other of set) other.send({ t: "peer-left", count: set.size });
  }
}
