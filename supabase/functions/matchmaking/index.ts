import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
function cleanPreset(value: unknown) {
  const preset = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9-]{1,48}$/.test(preset) ? preset : "frontier";
}
function cleanSide(value: unknown) {
  return value === "red" ? "red" : "blue";
}
function publicSession(room: Record<string, unknown>, playerToken: string, role: "host" | "guest") {
  const hostSide = room.host_side === "red" ? "red" : "blue";
  const guestSide = hostSide === "blue" ? "red" : "blue";
  return {
    roomId: room.id,
    code: room.code,
    kind: room.kind,
    role,
    isHost: role === "host",
    playerToken,
    side: role === "host" ? hostSide : guestSide,
    opponentSide: role === "host" ? guestSide : hostSide,
    seed: Number(room.seed),
    presetId: room.preset_id,
    gameMode: room.game_mode,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: corsHeaders });

  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const expectedKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");

  if (!url || !secretKey || !expectedKey) {
    return new Response(JSON.stringify({ error: "server_not_configured" }), { status: 500, headers: corsHeaders });
  }
  if (req.headers.get("apikey") !== expectedKey) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const body = await req.json();
    const action = body?.action;
    const now = new Date();
    const nowIso = now.toISOString();
    await admin.from("multiplayer_rooms").delete().lt("expires_at", nowIso);

    if (action === "cancel_room") {
      const roomId = String(body?.roomId ?? "");
      const playerToken = String(body?.playerToken ?? "");
      if (!roomId || !playerToken) return new Response(JSON.stringify({ error: "invalid_cancel" }), { status: 400, headers: corsHeaders });
      const { data: room, error: readError } = await admin.from("multiplayer_rooms").select("id,host_token,guest_token,status").eq("id", roomId).maybeSingle();
      if (readError) throw readError;
      if (!room) return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      if (room.host_token !== playerToken && room.guest_token !== playerToken) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
      }
      const { error } = await admin.from("multiplayer_rooms").update({ status: "closed", updated_at: nowIso }).eq("id", roomId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "join_invite") {
      const code = String(body?.code ?? "").trim().toUpperCase();
      if (!/^[A-Z2-9]{8}$/.test(code)) {
        return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400, headers: corsHeaders });
      }
      const token = crypto.randomUUID();
      const { data: room, error } = await admin
        .from("multiplayer_rooms")
        .update({ guest_token: token, status: "ready", updated_at: nowIso })
        .eq("code", code)
        .eq("kind", "invite")
        .eq("status", "waiting")
        .is("guest_token", null)
        .gt("expires_at", nowIso)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!room) return new Response(JSON.stringify({ error: "room_unavailable" }), { status: 409, headers: corsHeaders });
      return new Response(JSON.stringify({ session: publicSession(room, token, "guest") }), { headers: corsHeaders });
    }

    if (action === "quickplay") {
      const { data: waiting, error: waitingError } = await admin
        .from("multiplayer_rooms")
        .select("*")
        .eq("kind", "quickplay")
        .eq("status", "waiting")
        .is("guest_token", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(8);
      if (waitingError) throw waitingError;

      for (const candidate of waiting ?? []) {
        const token = crypto.randomUUID();
        const { data: claimed, error: claimError } = await admin
          .from("multiplayer_rooms")
          .update({ guest_token: token, status: "ready", updated_at: nowIso })
          .eq("id", candidate.id)
          .eq("status", "waiting")
          .is("guest_token", null)
          .select("*")
          .maybeSingle();
        if (claimError) throw claimError;
        if (claimed) return new Response(JSON.stringify({ session: publicSession(claimed, token, "guest") }), { headers: corsHeaders });
      }

      const token = crypto.randomUUID();
      const hostSide = cleanSide(body?.side);
      const row = {
        code: makeCode(), kind: "quickplay", status: "waiting", host_token: token, guest_token: null,
        host_side: hostSide, guest_side: hostSide === "blue" ? "red" : "blue",
        preset_id: cleanPreset(body?.presetId), game_mode: "scenario", seed: randomSeed(),
        expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        row.code = makeCode();
        const { data: created, error: createError } = await admin.from("multiplayer_rooms").insert(row).select("*").single();
        if (!createError && created) return new Response(JSON.stringify({ session: publicSession(created, token, "host") }), { headers: corsHeaders });
        if (createError?.code !== "23505") throw createError;
      }
      throw new Error("could_not_allocate_room_code");
    }

    if (action === "create_invite") {
      const token = crypto.randomUUID();
      const hostSide = cleanSide(body?.side);
      const row = {
        code: makeCode(), kind: "invite", status: "waiting", host_token: token, guest_token: null,
        host_side: hostSide, guest_side: hostSide === "blue" ? "red" : "blue",
        preset_id: cleanPreset(body?.presetId), game_mode: "scenario", seed: randomSeed(),
        expires_at: new Date(now.getTime() + 6 * 60 * 60_000).toISOString(),
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        row.code = makeCode();
        const { data: created, error: createError } = await admin.from("multiplayer_rooms").insert(row).select("*").single();
        if (!createError && created) return new Response(JSON.stringify({ session: publicSession(created, token, "host") }), { headers: corsHeaders });
        if (createError?.code !== "23505") throw createError;
      }
      throw new Error("could_not_allocate_room_code");
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }), { status: 500, headers: corsHeaders });
  }
});
