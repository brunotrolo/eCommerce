# Análise Completa do Tiops MCP para Aplicativo de Gestão de eCommerce
## Perfumes Árabes - Shopee + Mercado Livre

**Data:** 2026-08-01  
**Usuário:** Bruno Trolo  
**Caso de Uso:** Operação pequena, em crescimento - Perfumes Árabes

---

## 1. CATEGORIZAÇÃO DAS ~700 AÇÕES DO TIOPS MCP

### 1.1 SHOPEE (Maior Foco - 180+ ações)

#### A. Gestão de Produtos
- `shopee_create_item` - Criar novo anúncio
- `shopee_update_item` - Atualizar dados do produto
- `shopee_delete_item` - Remover anúncio
- `shopee_upload_image` - Upload de fotos
- `shopee_upload_video` - Upload de vídeos
- `shopee_get_item` - Recuperar dados do produto
- `shopee_get_items_batch` - Recuperar múltiplos produtos
- `shopee_list_items` - Listar todos os anúncios
- `shopee_get_models` - Variações de produto
- `shopee_add_model` - Adicionar variação
- `shopee_update_model` - Atualizar variação
- `shopee_delete_model` - Remover variação

**APLICÁVEL:** ✅ CRÍTICO - Base do controle de inventário

#### B. Preços e Estoque
- `shopee_update_price` - Atualizar preço
- `shopee_update_stock` - Atualizar quantidade
- `shopee_get_item_limit` - Verificar limite de anúncios
- `shopee_get_weight_recommendation` - Sugestão de peso
- `shopee_get_item_promotion` - Promoções ativas

**APLICÁVEL:** ✅ CRÍTICO - Base da calculadora de preços

#### C. Campanhas Publicitárias (Shopee Ads)
- `shopee_ads_campaigns` - Listar campanhas
- `shopee_ads_create_campaign` - Criar campanha
- `shopee_ads_edit_campaign` - Editar campanha
- `shopee_ads_pause_campaign` - Pausar campanha
- `shopee_ads_resume_campaign` - Retomar campanha
- `shopee_ads_campaign_daily` - Dados diários de campanha
- `shopee_ads_daily_performance` - Performance diária
- `shopee_ads_hourly_performance` - Performance horária
- `shopee_ads_balance` - Saldo de créditos
- `shopee_ads_recommended_items` - Itens recomendados
- `shopee_ads_recommended_keywords` - Keywords recomendadas
- `shopee_ads_roi_target` - Meta de ROI
- `shopee_ads_delete_keywords` - Remover palavras-chave
- `shopee_ads_edit_keywords` - Editar palavras-chave
- `shopee_ads_facil_rate` - Taxa Fácil

**APLICÁVEL:** ✅ CRÍTICO - Rastreamento de gastos em campanhas

#### D. Pedidos e Entregas
- `shopee_get_order` - Dados do pedido
- `shopee_get_order_detail` - Detalhes completos
- `shopee_list_orders` - Listar pedidos
- `shopee_search_orders` - Buscar pedidos
- `shopee_order_detail` - Detalhes do pedido
- `shopee_orders` - Histórico de pedidos
- `shopee_ship_order` - Marcar como enviado
- `shopee_handle_buyer_cancellation` - Gerenciar cancelamentos
- `shopee_get_shipment_list` - Lista de envios
- `shopee_get_tracking_number` - Número de rastreamento
- `shopee_get_reverse_tracking` - Rastreamento reverso

**APLICÁVEL:** ✅ MODERADO - Visibilidade operacional

#### E. Receita e Financeiro
- `shopee_get_shop_income` - Renda total da loja
- `shopee_get_income_overview` - Visão geral de renda
- `shopee_get_income_detail` - Detalhes de renda
- `shopee_get_income_report` - Relatório de renda
- `shopee_get_escrow_detail` - Detalhes de depósito
- `shopee_get_escrow_list` - Lista de depósitos
- `shopee_get_payout_info` - Info de pagamento
- `shopee_get_payout_detail` - Detalhes de pagamento
- `shopee_get_wallet_transactions` - Transações de carteira
- `shopee_get_billing_transaction_info` - Info de faturamento

**APLICÁVEL:** ✅ MODERADO - Reconciliação financeira

#### F. Métricas de Vendas
- `shopee_sales_summary` - Resumo de vendas
- `shopee_sales_by_item` - Vendas por produto
- `shopee_get_visits` - Visitas à loja
- `shopee_get_seller_metrics` - Métricas do vendedor

**APLICÁVEL:** ✅ CRÍTICO - Análise de performance

---

### 1.2 MERCADO LIVRE (110+ ações)

#### A. Gestão de Produtos
- `ml_create_item` - Criar anúncio (via Olist, não direto)
- `ml_get_product` - Recuperar produto
- `ml_search_items` - Buscar produtos

**APLICÁVEL:** ⚠️ PARCIAL - Tiops trata ML via abstração Olist

#### B. Preços
- `ml_item_sale_price` - Preço de venda do item
- `ml_item_prices` - Histórico de preços
- `ml_get_price_rules` - Regras de preço

**APLICÁVEL:** ✅ MODERADO

#### C. Campanhas (Ads)
- `ml_ads_accounts` - Contas de publicidade
- `ml_ads_campaigns` - Campanhas ativas
- `ml_ads_metrics` - Métricas de campanhas
- `ml_ads_metrics_grouped` - Métricas agrupadas
- `ml_ads_daily_performance` - Performance diária

**APLICÁVEL:** ✅ CRÍTICO - Mesmo propósito que Shopee Ads

#### D. Pedidos
- `ml_get_order` - Dados do pedido
- `ml_order_bundle` - Pacotes de pedidos
- `ml_search_orders` - Buscar pedidos

**APLICÁVEL:** ✅ MODERADO

---

### 1.3 BLING (ERP) - 50+ ações

#### A. Produtos
- `bling_create_product` - Criar produto
- `bling_get_product` - Recuperar produto
- `bling_update_product` - Atualizar produto
- `bling_products` - Listar produtos

**APLICÁVEL:** ✅ ALTO - Sincronização de custo de compra

#### B. Estoque
- `bling_stock` - Saldo de estoque
- `bling_get_tax_rules` - Regras fiscais

**APLICÁVEL:** ✅ MODERADO

#### C. Pedidos e Notas Fiscais
- `bling_orders` - Pedidos do Bling
- `bling_get_order` - Detalhes de pedido
- `bling_invoices` - Notas fiscais
- `bling_get_invoice` - Detalhes de NF
- `bling_emit_invoice` - Emitir NF
- `bling_send_invoice` - Enviar NF

**APLICÁVEL:** ✅ MODERADO - Integração contábil

#### D. Financeiro
- `bling_accounts_payable` - Contas a pagar
- `bling_accounts_receivable` - Contas a receber
- `bling_deposits` - Depósitos
- `bling_calculate_taxes` - Calcular impostos

**APLICÁVEL:** ✅ MODERADO - Controle financeiro

---

### 1.4 OLIST (50+ ações)

**APLICÁVEL:** ⚠️ BAIXO - Não é marketplace ativo do usuário, mas pode ser útil no futuro

---

### 1.5 OUTROS MARKETPLACES

#### Amazon (40+ ações)
- `amazon_create_listing` - Criar anúncio
- `amazon_get_order` - Dados de pedido
- `amazon_list_orders` - Listar pedidos
- `amazon_list_inventory` - Inventário
- `amazon_update_listing` - Atualizar anúncio

**APLICÁVEL:** ⚠️ BAIXO - Não é marketplace ativo, potencial futuro

#### Shein (30+ ações)
**APLICÁVEL:** ❌ NÃO APLICÁVEL - Não é marketplace ativo

---

## 2. MAPEAMENTO DO CASO DE USO ESPECÍFICO

### Necessidade 1: CALCULADORA DE FORMAÇÃO DE PREÇO
**Fluxo:** Preço de Compra → Preço de Venda com Margem Desejada

#### Dados Necessários:
1. **Custo de Compra** → `bling_get_product` (campo custo)
2. **Preço Atual** → `shopee_get_item`, `ml_get_product`
3. **Gastos com Ads (por produto)** → `shopee_ads_daily_performance`, `ml_ads_metrics`
4. **Taxa da Plataforma** → Shopee ~2-5%, ML ~11-16% (dados estáticos)
5. **Imposto** → `bling_calculate_taxes`
6. **Margem Desejada** → Input do usuário

#### Fórmula de Cálculo:
```
Preço Venda = (Custo Compra + (Gasto Ads / Quantidade Vendida) + Imposto) / (1 - Taxa Plataforma - Margem %)
```

#### APIs Utilizadas:
- ✅ `bling_get_product` - Recuperar custo
- ✅ `shopee_get_item` - Preço atual Shopee
- ✅ `shopee_ads_daily_performance` - Gasto em ads
- ✅ `bling_calculate_taxes` - Cálculo fiscal
- ✅ `shopee_update_price` - Atualizar preço calculado
- ✅ `ml_item_sale_price` - Preço ML

**Viável:** ✅ SIM - 100% possível

---

### Necessidade 2: CONTROLE DE LUCRO/PREJUÍZO POR PRODUTO
**Fluxo:** Vendas do Período → Lucro Real por SKU

#### Dados Necessários:
1. **Receita Bruta** → `shopee_sales_by_item`, `ml_get_order` (via loop)
2. **Custo dos Vendidos** → Quantidade Vendida × `bling_get_product` (custo)
3. **Despesas (Ads, Comissão, Imposto)** → `shopee_ads_daily_performance`, `ml_ads_metrics`
4. **Descontos/Devoluções** → `shopee_handle_buyer_cancellation`

#### Relatório Gerado:
```
Lucro Líquido por Produto = Receita Bruta - Custo - Comissões - Ads - Impostos - Devoluções
Margem % = Lucro / Receita
```

#### APIs Utilizadas:
- ✅ `shopee_sales_by_item` - Vendas por SKU Shopee
- ✅ `bling_get_product` - Custo por SKU
- ✅ `shopee_ads_daily_performance` - Gasto em ads
- ✅ `ml_ads_metrics` - Gasto em ads ML
- ✅ `shopee_get_order_detail` - Detalhes de devoluções
- ✅ `bling_calculate_taxes` - Imposto por item

**Viável:** ✅ SIM - 90% possível (falta detalhamento de comissões variáveis)

---

### Necessidade 3: RASTREAMENTO DE GASTOS EM CAMPANHAS
**Fluxo:** Campanha → ROI Real

#### Dados Necessários:
1. **Campanha ID** → `shopee_ads_campaigns`
2. **Gasto Diário** → `shopee_ads_campaign_daily` (campo spend)
3. **Conversões** → `shopee_ads_daily_performance` (field: conversions)
4. **Receita Atribuível** → Correlacionar com `shopee_sales_summary`
5. **ROI = Lucro Atribuível / Gasto**

#### APIs Utilizadas:
- ✅ `shopee_ads_campaigns` - Listar campanhas
- ✅ `shopee_ads_campaign_daily` - Dados diários (spend, impressões, cliques)
- ✅ `shopee_ads_daily_performance` - Performance (conversões, vendas, ROAS)
- ✅ `shopee_ads_hourly_performance` - Performance por hora
- ✅ `shopee_ads_roi_target` - Meta de ROI
- ✅ `ml_ads_campaigns` - Campanhas ML
- ✅ `ml_ads_metrics` - Métricas ML (CPC, ROAS, etc)

#### Dashboard Mínimo:
```
┌─────────────────────────────────────────┐
│ SHOPEE ADS - MÊS/ANO                    │
├─────────────────────────────────────────┤
│ Total Gasto:        R$ XXX.XX           │
│ Conversões:         XXX                 │
│ Receita:            R$ XXXX.XX          │
│ Lucro Atribuível:   R$ XXXX.XX          │
│ ROAS:               X.XX                │
│ ROI:                XXX%                │
└─────────────────────────────────────────┘
```

**Viável:** ✅ SIM - 95% possível (Shopee fornece ROAS, ML não tão preciso)

---

### Necessidade 4: CONTROLE GERAL DA OPERAÇÃO
**Fluxo:** Dashboard Executivo

#### Visão 360:
```
┌────────────────────────────────────────────────────────────────┐
│ DASHBOARD OPERACIONAL - MÊS/ANO                                │
├──────────────────────────┬──────────────────────────────────────┤
│ SHOPEE                   │ MERCADO LIVRE                        │
│ ├─ Vendas: R$ XXXX      │ ├─ Vendas: R$ XXXX                  │
│ ├─ Pedidos: XXX          │ ├─ Pedidos: XXX                     │
│ ├─ Gasto Ads: R$ XXX    │ ├─ Gasto Ads: R$ XXX               │
│ ├─ Lucro: R$ XXXX       │ ├─ Lucro: R$ XXXX                  │
│ └─ Margem: XX%          │ └─ Margem: XX%                     │
├──────────────────────────┴──────────────────────────────────────┤
│ TOP 5 PRODUTOS                                                  │
│ 1. Sabah Al Ward    | Vendas: 23 | Lucro: R$ 2.530 | Margem: 18%│
│ 2. Asad Elixir      | Vendas: 15 | Lucro: R$ 1.750 | Margem: 16%│
│ ... (3-5 omitidos)                                              │
├──────────────────────────────────────────────────────────────────┤
│ INDICADORES CHAVE                                                │
│ ├─ Ticket Médio: R$ XXX                                         │
│ ├─ Custo Aquisição: R$ XX                                       │
│ ├─ Dias Inventário: X dias                                      │
│ └─ Taxa Cancelamento: X%                                        │
└────────────────────────────────────────────────────────────────┘
```

#### APIs Utilizadas:
- ✅ `shopee_sales_summary` - Resumo de vendas
- ✅ `shopee_get_shop_income` - Renda Shopee
- ✅ `ml_get_order` - Pedidos ML (loop)
- ✅ `shopee_ads_campaigns` - Campanhas Shopee
- ✅ `ml_ads_campaigns` - Campanhas ML
- ✅ `bling_products` - Todos os produtos (estoque)
- ✅ `shopee_get_visits` - Visitas/tráfego
- ✅ `shopee_list_orders` - Histórico de pedidos

**Viável:** ✅ SIM - 85% possível (depende de automação de cálculos)

---

## 3. ARQUITETURA RECOMENDADA

### 3.1 Stack Tecnológico (Opção A: Sheets + Apps Script)

```
┌─────────────────────────────────────────────┐
│  GOOGLE SHEETS (UI Simples)                 │
│  ├─ Abas: Calculadora | Produtos | Ads     │
│  ├─ Abas: Dashboard | Margem Análise       │
│  └─ Abas: Config (API Keys)                │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│  GOOGLE APPS SCRIPT (Orquestração)         │
│  ├─ Scripts:                                │
│  │  ├─ sincronizar_produtos.gs             │
│  │  ├─ calcular_preco.gs                   │
│  │  ├─ atualizar_dashboard.gs              │
│  │  ├─ relatorio_ads.gs                    │
│  │  └─ sync_vendas.gs                      │
│  └─ Trigger: Diário 00:05 UTC-3            │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│  TIOPS MCP (Camada de Integração)          │
│  ├─ Shopee: Preços, Produtos, Ads         │
│  ├─ Mercado Livre: Preços, Ads, Pedidos   │
│  ├─ Bling: Custo, Imposto                  │
│  └─ Cache Local (Sheets > 1000 linhas)     │
└─────────────────────────────────────────────┘
```

### 3.2 Fluxo de Dados

**HORA 00:05 (Diário)**
```
1. Apps Script Trigger
   ↓
2. sincronizar_produtos.gs
   ├─ bling_get_product (todos)
   ├─ shopee_list_items
   └─ Atualizar Sheet: "Produtos"
   ↓
3. sync_vendas.gs
   ├─ shopee_sales_by_item (últimos 30 dias)
   ├─ shopee_get_order_detail (todas as ordens)
   ├─ ml_get_order (todas as ordens)
   └─ Atualizar Sheet: "Vendas"
   ↓
4. relatorio_ads.gs
   ├─ shopee_ads_campaigns
   ├─ shopee_ads_campaign_daily (últimos 30 dias)
   ├─ ml_ads_campaigns
   ├─ ml_ads_metrics (últimos 30 dias)
   └─ Atualizar Sheet: "Ads"
   ↓
5. atualizar_dashboard.gs
   ├─ Ler dados de Produtos, Vendas, Ads
   ├─ Executar cálculos de margem
   ├─ Gerar gráficos
   └─ Atualizar Sheet: "Dashboard"
   ↓
6. Notificação por email (opcional)
```

### 3.3 Estrutura de Sheets

#### Aba: "Configuração"
```
API Key Tiops:           [●●●●●●●●●●●●●●]
Email Notificação:       brunotrolo@gmail.com
Moeda:                   BRL
Margem Desejada Padrão:  20%
Imposto Estimado:        15%
Taxa Shopee:             4%
Taxa ML:                 12%
Última Sincronização:    2026-08-01 00:05
```

#### Aba: "Produtos"
```
┌─────────────────────────────────────────────────────────┐
│ SKU   │ Nome         │ Custo│ Preço_Sh│ Preço_ML│ Estoque│
├─────────────────────────────────────────────────────────┤
│ SW001 │ Sabah Al Ward│ 90  │ 164.99  │ 169.99  │ 15    │
│ AE001 │ Asad Elixir  │ 110 │ 289.99  │ 299.99  │ 8     │
│ ...   │ ...          │ ... │ ...     │ ...     │ ...   │
└─────────────────────────────────────────────────────────┘
```

#### Aba: "Calculadora"
```
CALCULAR PREÇO DE VENDA

Produto:           [Dropdown: Sabah Al Ward]
Preço de Compra:   R$ 90.00 (auto-preenchido)
Margem Desejada:   20% (editável)
Volume Mensal Est: 25 unidades (histórico)

Cálculo:
├─ Custo:          R$ 90.00
├─ Imposto (15%):  R$ 13.50
├─ Comissão Shop:  R$ 7.00 (4%)
├─ Gasto Ads/un:   R$ 2.50 (dividido por vol)
├─ Subtotal:       R$ 113.00
└─ Preço Venda:    R$ 165.00 (com 20% margem)

Comparação com Mercado:
├─ Shopee Atual:   R$ 164.99 ✓ Compatível
└─ ML Atual:       R$ 169.99 ✓ Compatível
```

#### Aba: "Dashboard"
```
┌──────────────────────────────────────────────┐
│ RESUMO MENSAL (Agosto 2026)                  │
├──────────────────────────────────────────────┤
│ SHOPEE                                       │
│ ├─ Receita Bruta:     R$ 15,240.00          │
│ ├─ Custo Produtos:    R$ 4,200.00           │
│ ├─ Gasto Ads:         R$ 1,500.00           │
│ ├─ Imposto/Comissão:  R$ 2,100.00           │
│ ├─ Lucro Líquido:     R$ 7,440.00           │
│ └─ Margem:            48.8%                 │
│                                              │
│ MERCADO LIVRE                                │
│ ├─ Receita Bruta:     R$ 8,920.00           │
│ ├─ Custo Produtos:    R$ 2,200.00           │
│ ├─ Gasto Ads:         R$ 800.00             │
│ ├─ Imposto/Comissão:  R$ 1,500.00           │
│ ├─ Lucro Líquido:     R$ 3,420.00           │
│ └─ Margem:            38.4%                 │
│                                              │
│ TOTAL OPERAÇÃO                               │
│ ├─ Receita Total:     R$ 24,160.00          │
│ ├─ Lucro Total:       R$ 10,860.00          │
│ ├─ Margem Geral:      45%                   │
│ ├─ Gasto Ads:         R$ 2,300.00 (9.5%)   │
│ └─ ROI Ads:           R$ 4.71 por R$ 1     │
└──────────────────────────────────────────────┘

TOP 3 PRODUTOS
┌──────────────┬──────────┬──────────┬─────────┐
│ Produto      │ Vendas   │ Margem $ │ Margem %│
├──────────────┼──────────┼──────────┼─────────┤
│ Sabah Al Ward│ 28 un    │ R$ 3,920 │ 52%     │
│ Asad Elixir  │ 15 un    │ R$ 2,250 │ 48%     │
│ Khamrah      │ 12 un    │ R$ 1,320 │ 42%     │
└──────────────┴──────────┴──────────┴─────────┘
```

#### Aba: "Ads"
```
┌─────────────────────────────────────────────────────────┐
│ ANÁLISE DE CAMPANHAS (Agosto 2026)                      │
├─────────────────────────────────────────────────────────┤
│ SHOPEE ADS                                              │
│                                                         │
│ Campanha: Sabah Al Ward - Top (ID: 123456)            │
│ ├─ Gasto Total:       R$ 850.00                        │
│ ├─ Impressões:        12,500                           │
│ ├─ Cliques:           280                              │
│ ├─ CTR:               2.24%                            │
│ ├─ Conversões:        28                               │
│ ├─ CPC:               R$ 3.04                          │
│ ├─ Receita Gerada:    R$ 4,620.00                      │
│ ├─ Lucro Atribuível:  R$ 2,100.00                      │
│ └─ ROI:               247%                             │
│                                                         │
│ Campanha: Asad Elixir - Search (ID: 654321)          │
│ ├─ Gasto Total:       R$ 650.00                        │
│ ├─ Conversões:        15                               │
│ ├─ CPA:               R$ 43.33                         │
│ ├─ Receita Gerada:    R$ 4,350.00                      │
│ ├─ Lucro Atribuível:  R$ 1,950.00                      │
│ └─ ROI:               300%                             │
│                                                         │
│ MERCADO LIVRE ADS                                      │
│                                                         │
│ Campanha: Perfumes Árabes (ID: ML_789)               │
│ ├─ Gasto Total:       R$ 800.00                        │
│ ├─ Clicks:            156                              │
│ ├─ Vendas Atribuídas: 18                               │
│ ├─ Receita:           R$ 3,240.00                      │
│ ├─ ROAS:              4.05                             │
│ └─ ROI:               305%                             │
└─────────────────────────────────────────────────────────┘
```

---

## 4. IMPLEMENTAÇÃO FASEADA

### FASE 1 (Semana 1-2): MVP Mínimo
**Objetivo:** Calculadora de Preço + Sincronização Básica

**Entraves:**
1. ✅ `bling_get_product` - Recuperar custo
2. ✅ `shopee_list_items` - Listar produtos Shopee
3. ✅ `shopee_update_price` - Atualizar preço com fórmula
4. ✅ Fórmula de cálculo no Apps Script
5. ✅ Sheet com valores de configuração

**Tempo Estimado:** 5-8 horas  
**Resultado:** Planilha que calcula preço automático baseado no custo

---

### FASE 2 (Semana 3-4): Dashboard de Vendas
**Objetivo:** Controle de Lucro/Prejuízo Diário

**Endpoints:**
1. ✅ `shopee_sales_by_item` - Vendas por SKU
2. ✅ `shopee_get_order_detail` - Detalhes de pedidos
3. ✅ `ml_get_order` - Pedidos ML (via loop)
4. ✅ Cálculo de lucro em Apps Script
5. ✅ Atualização automática diária

**Tempo Estimado:** 6-10 horas  
**Resultado:** Dashboard com lucro/prejuízo por produto atualizado diariamente

---

### FASE 3 (Semana 5-6): Rastreamento de Ads
**Objetivo:** ROI de Campanhas em Tempo Real

**Endpoints:**
1. ✅ `shopee_ads_campaigns` - Listar campanhas
2. ✅ `shopee_ads_campaign_daily` - Dados diários
3. ✅ `shopee_ads_daily_performance` - Performance
4. ✅ `ml_ads_campaigns` - Campanhas ML
5. ✅ `ml_ads_metrics` - Métricas ML

**Tempo Estimado:** 8-12 horas  
**Resultado:** Aba dedicada com ROI de cada campanha

---

### FASE 4 (Semana 7-8): Aplicativo Nativo (Opcional)
**Objetivo:** App Web com dados em tempo real

**Tecnologia Sugerida:**
- React + TypeScript
- Backend: Node.js + Express (hospedado em Vercel/Railway)
- Banco: Supabase (PostgreSQL) - Cache dos dados Tiops
- Frontend: Vercel
- Integração: Tiops MCP via backend

**Alternativa:** Flutter/React Native para mobile

**Tempo Estimado:** 20-30 horas  
**Resultado:** App web com push notifications de vendas

---

## 5. RISCOS E LIMITAÇÕES

### Limitações da Abordagem Sheets + Apps Script:
1. ⚠️ **Quotas Google:** 30k chamadas/dia (suficiente, mas justo)
2. ⚠️ **Latência:** Sincronização diária, não em tempo real
3. ⚠️ **Escalabilidade:** Máximo ~500k linhas por sheet (não problema agora)
4. ✅ **Custo:** Gratuito com Google Workspace padrão

### Limitações do Tiops MCP:
1. ⚠️ **Mercado Livre:** Menos detalhado que Shopee (sem API de performance por item)
2. ⚠️ **Devolução:** Não há endpoint específico para calcular devolução % automático
3. ⚠️ **Bling:** Precisa estar sincronizado com produtos Shopee/ML
4. ✅ **Shopee Ads:** Dados completos e confiáveis

### Recomendações:
- Manter atualização manual de custo no Bling (não há sync automático)
- Validar fórmula de impostos (variam por região/categoria)
- Testar integração com dados históricos antes de ir ao vivo

---

## 6. PRÓXIMAS AÇÕES IMEDIATAS

### Próximas 24 horas:
1. ✅ Criar Google Sheet template ("eCommerce Manager")
2. ✅ Configurar API Key Tiops no Sheet
3. ✅ Testar `bling_get_product` com dados reais
4. ✅ Testar `shopee_list_items` com dados reais

### Próximos 3 dias:
5. ✅ Implementar fórmula de cálculo no Apps Script
6. ✅ Criar aba de Calculadora
7. ✅ Validar com 3-5 produtos reais

### Próxima semana:
8. ✅ Implementar sync de vendas diário
9. ✅ Criar Dashboard básico
10. ✅ Testar atualização de preços automática

---

## 7. CONCLUSÃO

**É totalmente viável criar um aplicativo/planilha de gestão de ecommerce com o Tiops MCP.**

**MVP (Fase 1-2): 2 semanas de trabalho**
- ✅ Calculadora de preço funcional
- ✅ Dashboard de lucro/prejuízo
- ✅ Sincronização automática diária

**Full Stack (Fase 1-4): 6-8 semanas de trabalho**
- ✅ Tudo acima +
- ✅ Rastreamento completo de Ads
- ✅ App web com interface profissional

**Custo para você:** Mínimo (apenas Google Workspace + Tiops)  
**Manutenção:** ~30 min/semana após implementação

---

**Próximo passo: Deseja começar pela Fase 1 (Calculadora + MVP)?**
