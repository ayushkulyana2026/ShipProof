/** Postgres schema (idempotent). Applied automatically on first use and by `npm run db:migrate`. */
export const SCHEMA_SQL = `
-- ShipProof backend schema (Postgres). Idempotent: safe to run on every deploy.
-- Holds contact and billing records only. Invoices, orders and audit results
-- are processed in the browser and are never stored here.

create table if not exists leads (
  id            bigserial primary key,
  email         text not null,
  name          text,
  company       text,
  monthly_orders text,
  plan_interest text not null,
  message       text,
  source        text,
  created_at    timestamptz not null default now()
);
create index if not exists leads_email_idx on leads (lower(email));

create table if not exists checkout_sessions (
  session_id  text primary key,
  email       text not null,
  plan        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists subscriptions (
  subscription_id            text primary key,
  customer_id                text,
  email                      text,
  product_id                 text,
  status                     text not null,
  next_billing_date          timestamptz,
  cancel_at_next_billing_date boolean not null default false,
  last_event_at              timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
-- Older databases: add columns introduced after the first release.
alter table subscriptions add column if not exists last_event_at timestamptz;
create index if not exists subscriptions_email_idx on subscriptions (lower(email));

create table if not exists payments (
  payment_id      text primary key,
  subscription_id text,
  customer_id     text,
  email           text,
  status          text,
  total_amount    bigint,
  currency        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per Dodo webhook delivery id: makes retried deliveries no-ops.
create table if not exists webhook_events (
  webhook_id  text primary key,
  type        text not null,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);
`;
