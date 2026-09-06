-- ============================================================================
-- MarketSystem — Sincronização em Nuvem (vendas, estoque e caixa)
-- ============================================================================
-- Execute UMA vez no Supabase SQL Editor (Settings → SQL Editor → New query).
--
-- Modelo de autoridade: OFFLINE-FIRST. O IndexedDB (Dexie) de cada dispositivo
-- é a fonte primária; a nuvem é um ESPELHO de auditoria/backup alimentado
-- exclusivamente pelo RPC `sync_push`, que:
--   1. deriva o `store_id` da associação do usuário (nunca confia no cliente);
--   2. aplica upsert idempotente (IDs UUID locais = chave primária);
--   3. roda com SECURITY INVOKER → as políticas RLS valem dentro da função.
--
-- Configuração inicial (uma vez por loja):
--   1. Crie a loja e vincule o dono (substitua pelo e-mail real):
--
--      insert into public.stores (name) values ('Mercado Central');
--      insert into public.store_members (store_id, user_id, role)
--      select s.id, u.id, 'OWNER'
--      from public.stores s, auth.users u
--      where s.name = 'Mercado Central' and u.email = 'dono@loja.com';
--
--   2. Em Configurações, conecte a nuvem com esse e-mail — o espelho passa a
--      ser mantido automaticamente.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Inquilino (loja) e vínculo do dono
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'OWNER'
             check (role in ('OWNER')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Tabelas espelho (IDs UUID locais = PK → upsert idempotente)
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id                uuid primary key,
  store_id          uuid not null references public.stores(id) on delete cascade,
  sale_number       text,
  "date"            timestamptz,
  items             jsonb not null default '[]',
  subtotal          numeric(12,2),
  discount          numeric(12,2),
  total             numeric(12,2),
  cost_total        numeric(12,2),
  profit            numeric(12,2),
  payment_methods   jsonb not null default '[]',
  customer_id       uuid,
  customer_name     text,
  status            text,
  cancel_reason     text,
  cancelled_at      timestamptz,
  cashier_session_id uuid,
  notes             text,
  refunds           jsonb not null default '[]',
  refunded_amount   numeric(12,2),
  synced_at         timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id             uuid primary key,
  store_id       uuid not null references public.stores(id) on delete cascade,
  product_id     uuid,
  product_name   text,
  type           text,
  quantity       numeric(12,3),
  previous_stock numeric(12,3),
  new_stock      numeric(12,3),
  reason         text,
  "date"         timestamptz,
  user_id        text,
  cost_price     numeric(12,2),
  synced_at      timestamptz not null default now()
);

create table if not exists public.cash_sessions (
  id                     uuid primary key,
  store_id               uuid not null references public.stores(id) on delete cascade,
  opened_at              timestamptz,
  closed_at              timestamptz,
  cashier_id             text,
  cashier_name           text,
  initial_balance        numeric(12,2),
  current_balance        numeric(12,2),
  total_in               numeric(12,2),
  total_out              numeric(12,2),
  total_sales            jsonb not null default '{}',
  expected_cash_in_drawer numeric(12,2),
  actual_cash_counted    numeric(12,2),
  difference             numeric(12,2),
  status                 text,
  notes                  text,
  synced_at              timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id           uuid primary key,
  store_id     uuid not null references public.stores(id) on delete cascade,
  session_id   uuid,
  type         text,
  amount       numeric(12,2),
  reason       text,
  "date"       timestamptz,
  cashier_name text,
  synced_at    timestamptz not null default now()
);

create table if not exists public.debt_records (
  id               uuid primary key,
  store_id         uuid not null references public.stores(id) on delete cascade,
  customer_id      uuid,
  sale_id          uuid,
  type             text,
  amount           numeric(12,2),
  previous_balance numeric(12,2),
  new_balance      numeric(12,2),
  "date"           timestamptz,
  description      text,
  receipt_number   text,
  synced_at        timestamptz not null default now()
);

create table if not exists public.customers (
  id            uuid primary key,
  store_id      uuid not null references public.stores(id) on delete cascade,
  name          text,
  phone         text,
  email         text,
  document      text,
  credit_limit  numeric(12,2),
  debt_balance  numeric(12,2),
  created_at    timestamptz,
  updated_at    timestamptz,
  notes         text,
  synced_at     timestamptz not null default now()
);

create index if not exists idx_sales_store_date on public.sales (store_id, "date");
create index if not exists idx_stock_movements_store_date on public.stock_movements (store_id, "date");
create index if not exists idx_cash_sessions_store_status on public.cash_sessions (store_id, status);
create index if not exists idx_cash_movements_store_date on public.cash_movements (store_id, "date");
create index if not exists idx_debt_records_store_customer on public.debt_records (store_id, customer_id);
create index if not exists idx_customers_store_name on public.customers (store_id, name);

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security: membro da loja enxerga/grava só dados da própria loja
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.sales enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.debt_records enable row level security;
alter table public.customers enable row level security;

create policy stores_select_member on public.stores
  for select to authenticated
  using (id in (select store_id from public.store_members where user_id = auth.uid()));

-- O dono só lê a própria associação; vínculos são criados no SQL Editor (papel
-- postgres, fora do RLS).
create policy store_members_select_own on public.store_members
  for select to authenticated
  using (user_id = auth.uid());

create policy sales_member_all on public.sales
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

create policy stock_movements_member_all on public.stock_movements
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

create policy cash_sessions_member_all on public.cash_sessions
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

create policy cash_movements_member_all on public.cash_movements
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

create policy debt_records_member_all on public.debt_records
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

create policy customers_member_all on public.customers
  for all to authenticated
  using (store_id in (select store_id from public.store_members where user_id = auth.uid()))
  with check (store_id in (select store_id from public.store_members where user_id = auth.uid()));

grant select on public.stores, public.store_members to authenticated;
grant select, insert, update, delete on
  public.sales, public.stock_movements, public.cash_sessions,
  public.cash_movements, public.debt_records, public.customers
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de push: upsert idempotente por entidade, com store_id derivado do
--    vínculo do usuário. SECURITY INVOKER → RLS continua valendo aqui dentro.
-- ---------------------------------------------------------------------------
create or replace function public.sync_push(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          jsonb;
  v_entity   text;
  v_row      jsonb;
  v_op       text;
  v_store    uuid;
  v_processed jsonb[] := '{}'::jsonb[];
begin
  select store_id into v_store
  from public.store_members
  where user_id = auth.uid();

  if v_store is null then
    raise exception 'Conta sem vínculo com a loja (tabela store_members).';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_entity := r->>'entity';
    v_row    := coalesce(r->'row', '{}'::jsonb);
    v_op     := coalesce(r->>'op', 'PUT');

    if v_entity = 'sales' then
      if v_op = 'DELETE' then
        delete from public.sales where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.sales (
          id, store_id, sale_number, "date", items, subtotal, discount, total,
          cost_total, profit, payment_methods, customer_id, customer_name, status,
          cancel_reason, cancelled_at, cashier_session_id, notes, refunds, refunded_amount
        ) values (
          (v_row->>'id')::uuid, v_store, v_row->>'saleNumber', (v_row->>'date')::timestamptz,
          coalesce(v_row->'items', '[]'::jsonb), (v_row->>'subtotal')::numeric,
          (v_row->>'discount')::numeric, (v_row->>'total')::numeric,
          (v_row->>'costTotal')::numeric, (v_row->>'profit')::numeric,
          coalesce(v_row->'paymentMethods', '[]'::jsonb), (v_row->>'customerId')::uuid,
          v_row->>'customerName', v_row->>'status', v_row->>'cancelReason',
          (v_row->>'cancelledAt')::timestamptz, (v_row->>'cashierSessionId')::uuid,
          v_row->>'notes', coalesce(v_row->'refunds', '[]'::jsonb),
          (v_row->>'refundedAmount')::numeric
        )
        on conflict (id) do update set
          sale_number = excluded.sale_number, "date" = excluded."date",
          items = excluded.items, subtotal = excluded.subtotal,
          discount = excluded.discount, total = excluded.total,
          cost_total = excluded.cost_total, profit = excluded.profit,
          payment_methods = excluded.payment_methods, customer_id = excluded.customer_id,
          customer_name = excluded.customer_name, status = excluded.status,
          cancel_reason = excluded.cancel_reason, cancelled_at = excluded.cancelled_at,
          cashier_session_id = excluded.cashier_session_id, notes = excluded.notes,
          refunds = excluded.refunds, refunded_amount = excluded.refunded_amount,
          synced_at = now();
      end if;

    elsif v_entity = 'stockMovements' then
      if v_op = 'DELETE' then
        delete from public.stock_movements where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.stock_movements (
          id, store_id, product_id, product_name, type, quantity,
          previous_stock, new_stock, reason, "date", user_id, cost_price
        ) values (
          (v_row->>'id')::uuid, v_store, (v_row->>'productId')::uuid, v_row->>'productName',
          v_row->>'type', (v_row->>'quantity')::numeric,
          (v_row->>'previousStock')::numeric, (v_row->>'newStock')::numeric,
          v_row->>'reason', (v_row->>'date')::timestamptz, v_row->>'userId',
          (v_row->>'costPrice')::numeric
        )
        on conflict (id) do update set
          product_id = excluded.product_id, product_name = excluded.product_name,
          type = excluded.type, quantity = excluded.quantity,
          previous_stock = excluded.previous_stock, new_stock = excluded.new_stock,
          reason = excluded.reason, "date" = excluded."date",
          user_id = excluded.user_id, cost_price = excluded.cost_price,
          synced_at = now();
      end if;

    elsif v_entity = 'cashSessions' then
      if v_op = 'DELETE' then
        delete from public.cash_sessions where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.cash_sessions (
          id, store_id, opened_at, closed_at, cashier_id, cashier_name,
          initial_balance, current_balance, total_in, total_out, total_sales,
          expected_cash_in_drawer, actual_cash_counted, difference, status, notes
        ) values (
          (v_row->>'id')::uuid, v_store, (v_row->>'openedAt')::timestamptz,
          (v_row->>'closedAt')::timestamptz, v_row->>'cashierId', v_row->>'cashierName',
          (v_row->>'initialBalance')::numeric, (v_row->>'currentBalance')::numeric,
          (v_row->>'totalIn')::numeric, (v_row->>'totalOut')::numeric,
          coalesce(v_row->'totalSales', '{}'::jsonb),
          (v_row->>'expectedCashInDrawer')::numeric, (v_row->>'actualCashCounted')::numeric,
          (v_row->>'difference')::numeric, v_row->>'status', v_row->>'notes'
        )
        on conflict (id) do update set
          opened_at = excluded.opened_at, closed_at = excluded.closed_at,
          cashier_id = excluded.cashier_id, cashier_name = excluded.cashier_name,
          initial_balance = excluded.initial_balance, current_balance = excluded.current_balance,
          total_in = excluded.total_in, total_out = excluded.total_out,
          total_sales = excluded.total_sales,
          expected_cash_in_drawer = excluded.expected_cash_in_drawer,
          actual_cash_counted = excluded.actual_cash_counted,
          difference = excluded.difference, status = excluded.status,
          notes = excluded.notes, synced_at = now();
      end if;

    elsif v_entity = 'cashMovements' then
      if v_op = 'DELETE' then
        delete from public.cash_movements where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.cash_movements (
          id, store_id, session_id, type, amount, reason, "date", cashier_name
        ) values (
          (v_row->>'id')::uuid, v_store, (v_row->>'sessionId')::uuid, v_row->>'type',
          (v_row->>'amount')::numeric, v_row->>'reason',
          (v_row->>'date')::timestamptz, v_row->>'cashierName'
        )
        on conflict (id) do update set
          session_id = excluded.session_id, type = excluded.type,
          amount = excluded.amount, reason = excluded.reason,
          "date" = excluded."date", cashier_name = excluded.cashier_name,
          synced_at = now();
      end if;

    elsif v_entity = 'debtRecords' then
      if v_op = 'DELETE' then
        delete from public.debt_records where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.debt_records (
          id, store_id, customer_id, sale_id, type, amount,
          previous_balance, new_balance, "date", description, receipt_number
        ) values (
          (v_row->>'id')::uuid, v_store, (v_row->>'customerId')::uuid,
          (v_row->>'saleId')::uuid, v_row->>'type', (v_row->>'amount')::numeric,
          (v_row->>'previousBalance')::numeric, (v_row->>'newBalance')::numeric,
          (v_row->>'date')::timestamptz, v_row->>'description', v_row->>'receiptNumber'
        )
        on conflict (id) do update set
          customer_id = excluded.customer_id, sale_id = excluded.sale_id,
          type = excluded.type, amount = excluded.amount,
          previous_balance = excluded.previous_balance, new_balance = excluded.new_balance,
          "date" = excluded."date", description = excluded.description,
          receipt_number = excluded.receipt_number, synced_at = now();
      end if;

    elsif v_entity = 'customers' then
      if v_op = 'DELETE' then
        delete from public.customers where id = (v_row->>'id')::uuid and store_id = v_store;
      else
        insert into public.customers (
          id, store_id, name, phone, email, document,
          credit_limit, debt_balance, created_at, updated_at, notes
        ) values (
          (v_row->>'id')::uuid, v_store, v_row->>'name', v_row->>'phone',
          v_row->>'email', v_row->>'document', (v_row->>'creditLimit')::numeric,
          (v_row->>'debtBalance')::numeric, (v_row->>'createdAt')::timestamptz,
          (v_row->>'updatedAt')::timestamptz, v_row->>'notes'
        )
        on conflict (id) do update set
          name = excluded.name, phone = excluded.phone, email = excluded.email,
          document = excluded.document, credit_limit = excluded.credit_limit,
          debt_balance = excluded.debt_balance, created_at = excluded.created_at,
          updated_at = excluded.updated_at, notes = excluded.notes,
          synced_at = now();
      end if;

    else
      raise exception 'Entidade desconhecida no sync: %', v_entity;
    end if;

    v_processed := v_processed || jsonb_build_object('entity', v_entity, 'id', v_row->>'id');
  end loop;

  return to_jsonb(v_processed);
end;
$$;

grant execute on function public.sync_push(jsonb) to authenticated;