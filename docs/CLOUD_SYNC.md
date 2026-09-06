# Sincronização em Nuvem (Supabase Postgres + RLS) — offline-first

> Documento de design da sincronização de **vendas, estoque e caixa** do
> MarketSystem para o Supabase Postgres, mantendo o IndexedDB local como fonte
> primária. Complementa `docs/SERVER_AUTH.md` (autenticação em nuvem).

## Modelo de autoridade (a decisão central)

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Dispositivo (fonte primária)│         │  Supabase Postgres (espelho) │
│                             │  push   │                              │
│  IndexedDB / Dexie          │ ───────▶ │  sales, stock_movements,    │
│  ┌───────────────────────┐  │ RPC      │  cash_sessions, ...         │
│  │ syncOutbox (outbox)   │  │ sync_push│  RLS por loja (store_members)│
│  └───────────────────────┘  │          │  upsert idempotente por UUID│
└─────────────────────────────┘          └──────────────────────────────┘
```

- **Offline-first:** toda gravação de negócio continua indo primeiro para o
  IndexedDB. Nenhuma operação do PDV depende da nuvem.
- **Nuvem = espelho de auditoria/backup.** O servidor **nunca** é lido para
  decisões de negócio nesta rodada.
- **Sem pull (deliberado):** puxar vendas de outros dispositivos duplicaria
  vendas nos relatórios locais (cada dispositivo tem seu IndexedDB). Pull do
  catálogo e leitura remota são evoluções documentadas no final.

## O que sincroniza

| Entidade local | Tabela na nuvem | Direção |
|---|---|---|
| `sales` (incl. `refunds[]`) | `sales` | push (upsert) |
| `stockMovements` | `stock_movements` | push (upsert) |
| `cashSessions` | `cash_sessions` | push (upsert) |
| `cashMovements` | `cash_movements` | push (upsert) |
| `debtRecords` (fiado) | `debt_records` | push (upsert) |
| `customers` | `customers` | push (upsert) |

## Mecânica: transactional outbox

1. **Hooks Dexie** (`src/utils/sync.ts`) em cada tabela sincronizada detectam
   `creating` / `updating` / `deleting` e registram a chave `entity:entityId`.
2. O enqueue é **adiado por um macrotask** (`setTimeout(0)`) — transações
   implícitas do Dexie têm escopo de object stores congelado, e `db.transaction`
   dentro de um hook viraria sub-transação do pai (erros `NotFoundError` /
   `SubTransactionError`). Após o commit/abort, o outbox é gravado em transação
   própria.
3. **Coalescing:** a chave primária do outbox é `entity:entityId`. Gravações
   repetidas do mesmo registro viram UMA entrada pendente (sempre o estado
   mais fresco no push).
4. **Auto-cura de fantasmas:** se a gravação de negócio abortar mas o enqueue
   rodar, a entrada aponta para um registro inexistente — o push a converte em
   `DELETE`, que é no-op no servidor.
5. **Idempotência:** IDs locais são `crypto.randomUUID()` = chave primária na
   nuvem. `INSERT ... ON CONFLICT (id) DO UPDATE` torna reenvios inofensivos.

> **Limitação honesta:** a entrada do outbox não é atomicamente gravada na
> mesma transação do registro de negócio (limitação do IndexedDB — não há
> triggers). A janela de perda é "commit do negócio OK + outbox não gravado +
> falha do navegador no mesmo instante"; o backup JSON completo e o coalescing
> cobrem o resto. Para dinheiro/estoque, a gravação de negócio em si continua
> atômica (transações Dexie existentes).

## Push

- Só roda com Supabase configurado **e** sessão de nuvem ativa
  (`provider: 'server'`). Login local por PIN acumula no outbox e envia depois.
- O motor lê o outbox (batch de 500), busca o **estado atual** de cada registro
  e chama o RPC `sync_push(p_rows jsonb)` uma vez por entidade.
- Sucesso → limpa as entradas do batch; falha → incrementa `attempts`, guarda
  o erro e aplica **backoff exponencial** (5s → 300s, teto).
- Gatilhos: push imediato ao entrar com a conta; pós-gravação (debounce 5s);
  intervalo de 30s; evento `online`; botão manual em Configurações.

## Row-Level Security (isolamento por loja)

- `stores` (1 linha por loja) + `store_members(store_id, user_id, role)`.
- Toda tabela espelho tem política RLS:
  `store_id in (select store_id from store_members where user_id = auth.uid())`
  em `using` **e** `with check` — vale para SELECT e para DML.
- `sync_push` roda `SECURITY INVOKER`: o `store_id` é **derivado da associação
  do usuário autenticado** no servidor — o cliente nunca informa (nem consegue
  forjar) a qual loja pertence.
- Operador sem vínculo recebe erro explícito; membros não podem se auto-vincular
  (política de `store_members` só permite ler a própria associação).

## Configuração

1. Execute `supabase/migrations/0001_cloud_sync.sql` no SQL Editor (uma vez).
2. Crie a loja e vincule os operadores (SQL no topo da migration, trocando o
   e-mail):
   ```sql
   insert into public.stores (name) values ('Mercado Central');
   insert into public.store_members (store_id, user_id, role)
   select s.id, u.id, 'ADMIN'
   from public.stores s, auth.users u
   where s.name = 'Mercado Central' and u.email = 'dono@loja.com';
   ```
3. Variáveis `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` já configuradas
   (mesmo projeto da autenticação).
4. Operadores entram com a conta (nuvem) — a partir daí o espelho é mantido.

## Comportamento em situações reais

| Situação | Comportamento |
|---|---|
| Venda com internet caindo | Grava local, entra no outbox; enviada no próximo push |
| Reabrir o app offline | Sessão local (PIN) segue funcionando; outbox espera |
| Login local por PIN | Nada é enviado (sem sessão de servidor); aviso em Configurações |
| Estorno/devolução parcial | Venda atualizada localmente → upsert do estado novo (refunds[] inclusos) |
| Restaurar backup | Recria registros → hooks geram PUTs → espelho acompanha a verdade local |
| Dois dispositivos | Ambos escrevem no MESMO espelho (UUIDs distintos); relatórios locais continuam independentes |
| Falha repetida do RPC | Backoff exponencial; pendências visíveis no Header e Configurações |

## Limites desta rodada (evoluções futuras)

1. **Pull do catálogo** (produtos/categorias) entre dispositivos — precisa de
   política de conflito (LWW por `updatedAt`) e `last_pulled_at` por dispositivo.
2. **Vista remota** para o dono (dashboard web lendo o espelho com RLS) — o
   espelho já está pronto para isso; falta uma UI de leitura.
3. **Multi-loja no mesmo projeto** — já suportado pelo modelo `store_members`;
   falta o fluxo de onboarding do vínculo.
4. **Sincronização bidirecional de vendas entre terminais** — exige definição
   de autoridade por venda/dispositivo e merge de relatórios (fora do escopo
   offline-first atual).

## Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/0001_cloud_sync.sql` | Schema espelho + RLS + RPC `sync_push` |
| `src/utils/sync.ts` | Hooks, outbox, push, backoff, motor |
| `src/db/index.ts` | Tabela `syncOutbox` (versão 2, aditiva) |
| `src/App.tsx` | Instala hooks; liga/desliga motor por provider |
| `src/components/layout/Header.tsx` | Badge de pendências |
| `src/pages/Settings.tsx` | Card de status + "Sincronizar Agora" |
| `src/db/seed.ts` | Pausa o outbox durante o seed (demo não vai para a nuvem) |