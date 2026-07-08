import { createSignalingServer } from "./server";

// Railway는 PORT 환경변수를 주입한다. 로컬 기본값 8787.
const PORT = Number(process.env.PORT) || 8787;

createSignalingServer().listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[signal] listening on :${PORT}`);
});
