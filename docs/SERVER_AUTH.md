# Autenticação em Nuvem (Supabase) com Fallback Offline

> Documento de design da autenticação real no servidor do MarketSystem,
> mantendo o modo offline-first como fallback garantido.

## Contexto

O MarketSystem é **offline-first**: todos os dados (produtos, vendas, caixa,
fiado) vivem no IndexedDB do navegador via Dexie. O Vercel serve apenas os
arquivos estáticos do PWA — **não existe banco de dados nem API própria no
Vercel** neste projeto.

Isso é uma decisão de arquitetura deliberada: um PDV de balcão precisa
funcionar mesmo com a internet caindo no meio de uma venda.

A autenticação em nuvem não substitui essa arquitetura — ela **complementa**:

| Camada | Papel |
|---|---|
| **Supabase Auth** | Validação real de credenciais no servidor (e-mail + senha) |
| **Login local por PIN** | Fallback offline — o caixa nunca fica preso fora do sistema |
| **IndexedDB/Dexie** | Dados do negócio, 100% locais (inalterado) |

## Como funciona

```
                    ┌──────────────────────────────────────┐
                    │           LoginScreen                │
                    └──────────────┬───────────────────────┘
                                   │
              VITE_SUPABASE_URL/KEY │ configurados e online?
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
        ┌──────────────────────┐      ┌──────────────────────┐
        │  Conta em nuvem      │      │  Acesso local (PIN)  │
        │  signInWithPassword  │      │  verificação SHA-256 │
        └──────────┬───────────┘      └──────────┬───────────┘
                   │                             │
                   │  espelha usuário            │
                   │  em `users` (IndexedDB)     │
                   ▼                             ▼
        ┌─────────────────────────────────────────────┐
        │  Sessão: localStorage `marketsystem.session` │
        │  provider: 'server' | 'local'                │
        └──────────────────────┬──────────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │  App (gate)          │
                    │  papel → menus       │
                    │  logout → ambos      │
                    └──────────────────────┘
```

### Fluxo da conta em nuvem (Supabase)

1. `src/utils/serverAuth.ts` cria o cliente Supabase **lazy** (só quando as
   variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem).
2. `loginWithServer(email, password)` chama `auth.signInWithPassword`.
3. Em sucesso, o usuário é **espelhado** na tabela local `users` (mesmo
   formato que o PDV usa — id do Supabase, papel, nome), e a sessão local é
   gravada com `provider: 'server'`.
4. O papel vem de `app_metadata.role` do Supabase; na ausência, reaproveita o
   papel local; senão assume o mínimo privilégio (`CASHIER`).
5. Logout encerra a sessão no Supabase (melhor esforço, tolerante a offline)
   **e** limpa a sessão local.

### Fallback offline

- A seção de conta em nuvem **só aparece** quando as variáveis estão
  configuradas **e** o navegador está online (`navigator.onLine`).
- O acesso local por PIN fica **sempre disponível**, com PIN hashado
  (SHA-256 via Web Crypto) e migração automática de PINs legados.
- O header mostra o provedor da sessão atual (Nuvem / Local) no menu do usuário.

## Configuração

### 1. Supabase

1. Crie um projeto em <https://supabase.com>.
2. Em **Authentication → Providers**, habilite **Email**.
3. Em **Settings → API**, copie a *Project URL* e a *anon public key*.

### 2. Vercel

1. No dashboard do projeto, **Settings → Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Redeploy. Variáveis `VITE_*` são embutidas no build pelo Vite.

### 3. Papéis dos usuários

O sistema lê `app_metadata.role` (`ADMIN` | `MANAGER` | `CASHIER`). Defina no
painel do Supabase ou via SQL:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"CASHIER"}'::jsonb
where id = '<user-id>';
```

Sem papel definido, o sistema usa o papel já cadastrado localmente ou assume
`CASHIER` (menor privilégio — por segurança).

## O que NÃO mudou

- Dados do negócio continuam **100% locais** (IndexedDB). O Supabase autentica
  apenas; não armazena vendas/estoque/caixa.
- O login local por PIN continua funcionando sem nenhuma configuração.
- A tabela `users` local é a fonte de verdade para operadores no PDV (abertura
  de caixa, movimentações).

## Segurança e limitações

| Item | Estado |
|---|---|
| Senhas no servidor | Gerenciadas pelo Supabase Auth (bcrypt, MFA disponível) |
| PINs locais | Hash SHA-256, nunca texto puro (migração automática de legados) |
| Sessão local | `localStorage` — vulnerável a acesso físico ao dispositivo |
| Sincronização de dados | **Fora de escopo**: sem Supabase Realtime/Postgres para dados do negócio |
| Controle de acesso | Por papel na UI (menus) — reforço no servidor exige RLS + backend |

### Evoluções possíveis (fora desta rodada)

1. **Sincronização de dados com Supabase Postgres + RLS** — vendas, estoque e
   caixa replicados para a nuvem como espelho offline-first — **implementada**;
   veja `docs/CLOUD_SYNC.md`.
2. **Sessão server-only** (sem sessão local persistente) — exige requisições
   autenticadas a um backend, quebrando o offline-first.
3. **MFA / bloqueio por dispositivo** para operadores de caixa.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/utils/serverAuth.ts` | Cliente Supabase lazy + login/logout em nuvem |
| `src/utils/auth.ts` | Login local por PIN, hash, sessão (`provider`) |
| `src/components/auth/LoginScreen.tsx` | UI dos dois fluxos + fallback offline |
| `src/App.tsx` | Gate de autenticação + logout híbrido |
| `src/components/layout/Header.tsx` | Badge do provedor da sessão |
| `.env.example` | Variáveis documentadas |