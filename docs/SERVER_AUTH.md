# Conexão em Nuvem (Supabase)

> **O PDV é monousuário.** Não há login, operadores nem papéis no aplicativo —
> uma única pessoa usa o sistema. Este documento descreve a conexão opcional
> com o Supabase, que existe apenas para autorizar o envio de dados ao
> Postgres (espelho de vendas/estoque/caixa). Detalhes do espelho em
> `docs/CLOUD_SYNC.md`.

## Contexto

O MarketSystem é **offline-first**: todos os dados (produtos, vendas, caixa,
fiado) vivem no IndexedDB do navegador via Dexie. O Vercel serve apenas os
arquivos estáticos do PWA — **não existe banco de dados nem API própria no
Vercel** neste projeto.

Isso é uma decisão de arquitetura deliberada: um PDV de balcão precisa
funcionar mesmo com a internet caindo no meio de uma venda.

A conexão em nuvem não substitui essa arquitetura — ela **complementa**:

| Camada | Papel |
|---|---|
| **Supabase Auth** | Autoriza o envio de dados ao Postgres (sessão fica no dispositivo) |
| **IndexedDB/Dexie** | Dados do negócio, 100% locais — fonte primária, sem login |

## Como funciona

- O aplicativo abre direto no Dashboard. **Nenhuma tela de login existe.**
- Em **Configurações → Sincronização com a Nuvem**, o dono pode conectar o
  espelho (link mágico enviado por e-mail) ou desconectar. Enquanto conectado,
  o motor de sync mantém o Postgres atualizado; desconectado, nada é enviado
  e o outbox apenas acumula.
- A sessão do Supabase é persistida pelo próprio supabase-js no dispositivo
  (sem relação com o uso local do PDV).

## O que NÃO existe mais

- ~~Tela de login~~ / ~~usuários e papéis (ADMIN/MANAGER/CASHIER)~~ /
  ~~PINs~~ / ~~restrição de menus por papel~~ — tudo removido na migração
  monousuário (a tabela legada `users` é descartada pelo schema v3 do Dexie).

## Configuração

1. Crie um projeto em <https://supabase.com> e habilite **Email** em
   Authentication → Providers.
2. No Vercel (**Settings → Environment Variables**), adicione
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e redeploy (variáveis
   `VITE_*` são embutidas no build).
3. Execute `supabase/migrations/0001_cloud_sync.sql` e vincule o e-mail do dono
   a uma loja (ver `docs/CLOUD_SYNC.md`).
4. Em Configurações, conecte a nuvem com esse e-mail.

## Segurança e limitações

| Item | Estado |
|---|---|
| Dados do negócio | 100% locais (IndexedDB); a nuvem recebe apenas o espelho |
| Autorização de escrita | RLS por loja no Postgres (`store_members`), store_id derivado no servidor |
| Sessão do Supabase | Persistida no dispositivo (supabase-js); desconectar em Configurações |
| Acesso físico ao dispositivo | Quem tem o dispositivo tem os dados — use criptografia de disco do SO |

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/utils/cloudConfig.ts` | Cliente Supabase lazy + `isCloudConfigured` |
| `src/utils/sync.ts` | Motor de push (verifica a sessão do Supabase antes de enviar) |
| `src/pages/Settings.tsx` | Card de sincronização: conectar/desconectar a nuvem |
| `supabase/migrations/0001_cloud_sync.sql` | Espelho, RLS e RPC `sync_push` |
