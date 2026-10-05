alter table public.multiplayer_rooms
  add column if not exists team_size smallint not null default 1
  check (team_size in (1,2,3));

update public.multiplayer_rooms
set status = 'closed', updated_at = now()
where status <> 'closed';

create table if not exists public.multiplayer_room_players (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  player_token uuid primary key,
  nickname text not null check (char_length(nickname) between 1 and 20),
  side text not null check (side in ('blue','red')),
  slot smallint not null check (slot between 1 and 3),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, side, slot)
);

create index if not exists multiplayer_room_players_room_idx
  on public.multiplayer_room_players (room_id, side, slot);

alter table public.multiplayer_room_players enable row level security;
revoke all on table public.multiplayer_room_players from anon, authenticated;
grant all on table public.multiplayer_room_players to service_role;

comment on column public.multiplayer_rooms.team_size is
  'Number of human commanders per side. 1, 2, or 3.';

comment on table public.multiplayer_room_players is
  'Server-only KSpiel room roster. Teammates on the same side share command of all formations.';