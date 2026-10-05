import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
type TeamSide = "blue" | "red";
type TeamSize = 1 | 2 | 3;

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
function cleanSide(value: unknown, fallback: TeamSide = "blue"): TeamSide {
  return value === "red" ? "red" : value === "blue" ? "blue" : fallback;
}
function cleanTeamSize(value: unknown): TeamSize {
  const n = Number(value);
  return n === 2 ? 2 : n === 3 ? 3 : 1;
}
function cleanNickname(value: unknown) {
  const nickname = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20) : "";
  return nickname || "Commander";
}
function otherSide(side: TeamSide): TeamSide {
  return side === "blue" ? "red" : "blue";
}
function publicSession(room: Record<string, unknown>, player: Record<string, unknown>) {
  const side = cleanSide(player.side);
  const teamSize = cleanTeamSize(room.team_size);
  return {
    roomId: room.id,
    code: room.code,
    kind: room.kind,
    role: player.is_host ? "host" : "player",
    isHost: Boolean(player.is_host),
    playerToken: player.player_token,
    nickname: player.nickname,
    side,
    opponentSide: otherSide(side),
    teamSize,
    maxPlayers: teamSize * 2,
    slot: Number(player.slot),
    seed: Number(room.seed),
    presetId: room.preset_id,
    gameMode: room.game_mode,
  };
}

async function addPlayer(admin: any, room: Record<string, any>, side: TeamSide, nickname: string, isHost = false, token = crypto.randomUUID()) {
  const teamSize = cleanTeamSize(room.team_size);
  for (let slot = 1; slot <= teamSize; slot++) {
    const { data: player, error } = await admin
      .from("multiplayer_room_players")
      .insert({
        room_id: room.id,
        player_token: token,
        nickname,
        side,
        slot,
        is_host: isHost,
      })
      .select("*")
      .single();

    if (!error && player) {
      const { count, error: countError } = await admin
        .from("multiplayer_room_players")
        .select("player_token", { count: "exact", head: true })
        .eq("room_id", room.id);
      if (countError) throw countError;
      if ((count ?? 0) >= teamSize * 2) {
        const { error: statusError } = await admin
          .from("multiplayer_rooms")
          .update({ status: "ready", updated_at: new Date().toISOString() })
          .eq("id", room.id)
          .neq("status", "closed");
        if (statusError) throw statusError;
      }
      return player as Record<string, unknown>;
    }
    if (error?.code !== "23505") throw error;
  }
  return null;
}

async function createRoom(admin: any, kind: "quickplay" | "invite", presetId: string, hostSide: TeamSide, teamSize: TeamSize, nickname: string, now: Date) {
  const token = crypto.randomUUID();
  const row = {
    code: makeCode(),
    kind,
    status: "waiting",
    host_token: token,
    guest_token: null,
    host_side: hostSide,
    guest_side: otherSide(hostSide),
    team_size: teamSize,
    preset_id: presetId,
    game_mode: "scenario",
    seed: randomSeed(),
    expires_at: new Date(now.getTime() + (kind === "quickplay" ? 15 * 60_000 : 6 * 60 * 60_000)).toISOString(),
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    row.code = makeCode();
    const { data: created, error: createError } = await admin.from("multiplayer_rooms").insert(row).select("*").single();
    if (!createError && created) {
      try {
        const player = await addPlayer(admin, created, hostSide, nickname, true, token);
        if (!player) throw new Error("could_not_allocate_host_slot");
        return { room: created, player };
      } catch (error) {
        await admin.from("multiplayer_rooms").delete().eq("id", created.id);
        throw error;
      }
    }
    if (createError?.code !== "23505") throw createError;
  }
  throw new Error("could_not_allocate_room_code");
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

      const { data: player, error: playerError } = await admin
        .from("multiplayer_room_players")
        .select("player_token")
        .eq("room_id", roomId)
        .eq("player_token", playerToken)
        .maybeSingle();
      if (playerError) throw playerError;
      if (!player) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

      const { error } = await admin.from("multiplayer_rooms").update({ status: "closed", updated_at: nowIso }).eq("id", roomId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "join_invite") {
      const code = String(body?.code ?? "").trim().toUpperCase();
      if (!/^[A-Z2-9]{8}$/.test(code)) {
        return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400, headers: corsHeaders });
      }

      const { data: room, error } = await admin
        .from("multiplayer_rooms")
        .select("*")
        .eq("code", code)
        .eq("kind", "invite")
        .eq("status", "waiting")
        .gt("expires_at", nowIso)
        .maybeSingle();
      if (error) throw error;
      if (!room) return new Response(JSON.stringify({ error: "room_unavailable" }), { status: 409, headers: corsHeaders });

      const legacyFallback = otherSide(cleanSide(room.host_side));
      const side = cleanSide(body?.side, legacyFallback);
      const player = await addPlayer(admin, room, side, cleanNickname(body?.nickname));
      if (!player) return new Response(JSON.stringify({ error: "team_full" }), { status: 409, headers: corsHeaders });
      return new Response(JSON.stringify({ session: publicSession(room, player) }), { headers: corsHeaders });
    }

    if (action === "quickplay") {
      const presetId = cleanPreset(body?.presetId);
      const side = cleanSide(body?.side);
      const teamSize = cleanTeamSize(body?.teamSize);
      const nickname = cleanNickname(body?.nickname);

      const { data: waiting, error: waitingError } = await admin
        .from("multiplayer_rooms")
        .select("*")
        .eq("kind", "quickplay")
        .eq("status", "waiting")
        .eq("team_size", teamSize)
        .eq("preset_id", presetId)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(16);
      if (waitingError) throw waitingError;

      for (const candidate of waiting ?? []) {
        const player = await addPlayer(admin, candidate, side, nickname);
        if (player) return new Response(JSON.stringify({ session: publicSession(candidate, player) }), { headers: corsHeaders });
      }

      const created = await createRoom(admin, "quickplay", presetId, side, teamSize, nickname, now);
      return new Response(JSON.stringify({ session: publicSession(created.room, created.player) }), { headers: corsHeaders });
    }

    if (action === "create_invite") {
      const presetId = cleanPreset(body?.presetId);
      const side = cleanSide(body?.side);
      const teamSize = cleanTeamSize(body?.teamSize);
      const nickname = cleanNickname(body?.nickname);
      const created = await createRoom(admin, "invite", presetId, side, teamSize, nickname, now);
      return new Response(JSON.stringify({ session: publicSession(created.room, created.player) }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }), { status: 500, headers: corsHeaders });
  }
});
