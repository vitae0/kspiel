create table public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  kind text not null check (kind in ('quickplay','invite')),
  status text not null default 'waiting' check (status in ('waiting','ready','closed')),
  host_token uuid not null,
  guest_token uuid,
  host_side text not null check (host_side in ('blue','red')),
  guest_side text not null check (guest_side in ('blue','red')),
  preset_id text not null,
  game_mode text not null default 'scenario' check (game_mode = 'scenario'),
  seed bigint not null check (seed >= 0 and seed <= 4294967295),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create index multiplayer_rooms_waiting_idx
  on public.multiplayer_rooms (kind, status, created_at)
  where status = 'waiting';

create index multiplayer_rooms_expiry_idx
  on public.multiplayer_rooms (expires_at);

alter table public.multiplayer_rooms enable row level security;
revoke all on table public.multiplayer_rooms from anon, authenticated;
grant all on table public.multiplayer_rooms to service_role;

comment on table public.multiplayer_rooms is
  'Server-only matchmaking metadata for KSpiel. Clients use the matchmaking Edge Function and Realtime channels.';
