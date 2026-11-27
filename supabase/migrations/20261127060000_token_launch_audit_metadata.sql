-- PIXORUN verified launch audit and durable token metadata
alter table public.token_launches
  add column if not exists tx_value_wei text,
  add column if not exists gas_used text,
  add column if not exists effective_gas_price_wei text,
  add column if not exists metadata_json jsonb,
  add column if not exists metadata_signature text,
  add column if not exists metadata_version smallint not null default 1,
  add column if not exists logo_sha256 text,
  add column if not exists banner_sha256 text,
  add column if not exists token_decimals smallint not null default 18,
  add column if not exists total_supply_wei text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists token_launches_creator_created_idx
  on public.token_launches (lower(creator_address), created_at desc);
create index if not exists token_launches_symbol_idx
  on public.token_launches (upper(token_symbol));
