# MarketSystem — Sistema de Gestão Comercial & PDV Inteligente

![MarketSystem Banner](https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80)

<div align="center">

[![React 19](https://img.shields.io/badge/React-19.0-blue.svg?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com)
[![Dexie.js](https://img.shields.io/badge/IndexedDB-Dexie.js-orange.svg)](https://dexie.org)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF.svg?logo=vite)](https://vitejs.dev)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline_First-emerald.svg)](https://developer.mozilla.org/docs/Web/Progressive_web_apps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Um ERP e Ponto de Venda (PDV) moderno, rápido, responsivo e offline-first para o varejo brasileiro.**

</div>

---

## 🌟 Principais Funcionalidades

### 1. 🛒 Ponto de Venda (PDV) Ágil
- **Atalhos Rápidos de Teclado**: `F2` (Buscar), `F3` (Leitor por Câmera), `F4` (Finalizar Venda), `F6` (Display do Cliente), `F7` (Scanner Celular), `F8` (Remover Item), `F9` (Limpar Carrinho).
- **Leitor de Código de Barras**: Suporte a scanners físicos USB/Bluetooth com buffer contínuo e leitor por webcam via `html5-qrcode` com bipe sintetizado por Web Audio API.
- **Venda Fracionada (Unidade Alternativa)**: Venda pacotes fechados ou frações avulsas (ex: 1 cigarro de um maço de 20, 1 lata de um pack de 12, produtos por KG) com baixa proporcional de estoque.
- **Troco Inteligente**: Decomposição automática da menor quantidade de cédulas (R$ 200, 100, 50, 20, 10, 5, 2) e moedas (R$ 1, 0.50, 0.25, 0.10, 0.05, 0.01) para agilizar o caixa.
- **Múltiplas Formas de Pagamento & Split**: Dinheiro, Cartão de Crédito, Débito, Pix (com QR Code copia e cola), Voucher e Caderneta (Fiado).
- **Display do Cliente (2ª Tela)**: Janela secundária em pop-up com sincronização em tempo real via `BroadcastChannel`.
- **Scanner Mobile Pareado**: Pareamento com celular do operador via QR Code ou código de 6 dígitos para usar o smartphone como leitor de código de barras.
- **Cupom Não-Fiscal Térmico (80mm e 58mm)**: Impressão direta com layout de bobina térmica e botão de envio de comprovante no WhatsApp.

### 2. 📦 Gestão de Estoque & Movimentações
- **Cadastro Completo**: Nome, SKU, Código de Barras (EAN-13), Categoria, Preço de Custo, Preço de Venda, Estoque Atual, Estoque Mínimo, Unidade e Validade.
- **Auditoria de Movimentações**: Entradas (compras de fornecedores), Saídas (avarias/vencimento), Vendas no PDV, Ajustes de Balanço e Estornos.
- **Auto-Inativação & Detecção Inteligente**: Detecção automática de produtos inativos ao digitar código ou SKU para sugerir reativação em vez de duplicidade.
- **Exportação**: Download do inventário e movimentações em CSV.

### 3. 🏷️ Precificação Comercial & Calculadora
- **Edição Rápida de Preço**: Popover inline na tabela com recálculo instantâneo de margem bruta (%), markup (%) e lucro unitário (R$).
- **Calculadora Bidirecional**:
  - *Custo → Preço de Venda Sugerido*
  - *Preço de Mercado → Custo Máximo Suportado*
  - *Simulador de Taxas (Débito, Crédito à vista/parcelado e Simples Nacional)*
  - Botão para salvar o preço calculado diretamente no produto com 1 clique.
- **Histórico Auditável de Preços**: Linha do tempo de todas as alterações com motivos e percentuais de reajuste.

### 4. 🧠 Painel Financeiro & Inteligência Comercial
- **5 Abas Analíticas Especializadas**:
  1. **Faturamento & Lucratividade**: Faturamento bruto, lucro líquido apurado pelo CMV histórico, ticket médio, itens por cesta (UPT), projeção mensal, simulador de ponto de equilíbrio (break-even) e heatmap de horários de pico.
  2. **Inteligência de Estoque & Fluxos**: Giro de estoque (turnover), DIO (dias médios de giro), balanço semanal de entradas vs saídas, taxa de avarias/perdas (%) e dias de autonomia de estoque por produto com **sugestão de pedido de reposição**.
  3. **Curva ABC & Rentabilidade**: Classificação matemática dos produtos em Classe A (80%), Classe B (15%) e Classe C (5%), ranking dos mais lucrativos em R$ e análise de Pareto por categoria.
  4. **Cesta de Compras & Cross-Selling**: Análise de afinidade de produtos frequentemente comprados juntos e distribuição do tamanho da cesta.
  5. **Clientes & Caderneta (Fiado)**: Taxa de penetração do fiado, taxa de comprometimento de limites concedidos e ranking de melhores clientes.
- **Ajuda Didática (?)**: Popover com conceito, fórmula matemática e dicas práticas de varejo em todos os cards.

### 5. 📒 Caderneta de Devedores (Fiado)
- Gestão de limite de crédito individual por cliente.
- Lançamento de compras a prazo no PDV com validação de limite.
- Amortização e quitação parcial ou total de débitos com comprovante e extrato.
- Lembrete de cobrança direto no WhatsApp com chave Pix e saldo devedor.

### 6. 💼 Controle de Caixa & Turnos
- Abertura de caixa com fundo de troco inicial.
- Movimentações de Sangria (retirada) e Suprimento (reforço) com justificativa.
- Fechamento de caixa com contagem física de dinheiro (conferência cega/aberta) e apuração de quebra/sobra.
- Relatório de fechamento detalhado para impressão.

### 7. ⚙️ Configurações, Backup & PWA
- Cadastro completo dos dados da loja, CNPJ, WhatsApp e mensagem de rodapé do cupom.
- Exportação e importação de backup completo em arquivo JSON.
- Recarga de base de demonstração realista em pt-BR.
- Tema Claro / Escuro / Automático.
- Instalável como PWA desktop e mobile via Service Worker com suporte offline total.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org)
- **Estilização**: [Tailwind CSS v4](https://tailwindcss.com), [Lucide React](https://lucide.dev)
- **Banco de Dados Local**: [Dexie.js (IndexedDB)](https://dexie.org) com `dexie-react-hooks`
- **Gráficos & Visualizações**: [Recharts](https://recharts.org)
- **Exportação & Documentos**: [jsPDF](https://github.com/parallax/jsPDF) e [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- **Leitor de Código de Barras**: [html5-qrcode](https://github.com/mebjas/html5-qrcode)
- **Notificações**: [Sonner](https://sonner.emilkowal.ski)
- **Áudio**: Web Audio API (sons sintetizados nativamente sem arquivos externos)
- **Bundler & Dev Server**: [Vite 8](https://vitejs.dev)

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org) (v18+)
- `npm` ou `yarn` ou `pnpm`

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/GabrielGLF/market-system.git
cd market-system
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

4. Acesse no navegador:
```
http://localhost:5173
```

### Build de Produção
```bash
npm run build
```

---

## 📱 Suporte a PWA & Mobile

O **MarketSystem** é totalmente responsivo e funciona como Progressive Web App (PWA):
- Pode ser instalado no Android/iOS ou no Desktop (Chrome/Edge).
- Funciona 100% offline utilizando o IndexedDB local.
- Sincroniza abas e janelas em tempo real via `BroadcastChannel`.

---

## 📄 Licença

Este projeto está sob a licença [MIT](LICENSE).
