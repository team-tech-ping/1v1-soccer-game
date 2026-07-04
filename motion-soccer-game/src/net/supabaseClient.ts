import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// env에서 자격증명을 읽어 Supabase client 싱글턴을 만든다.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
