create table if not exists public.invoice_items (
  id text primary key,
  name text not null,
  date date not null default current_date,
  country text default '',
  amount numeric not null default 0,
  gross_weight numeric not null default 0,
  actual_weight numeric not null default 0,
  cost_per_weight numeric not null default 0,
  billable_weight numeric not null default 0,
  currency text not null default 'NPR',
  method text not null default 'cash' check (method in ('cash', 'bank', 'qr')),
  status text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  created_at timestamptz not null default now()
);

alter table public.invoice_items enable row level security;

grant usage on schema public to service_role;
grant all on table public.invoice_items to service_role;
revoke all on table public.invoice_items from anon, authenticated;
