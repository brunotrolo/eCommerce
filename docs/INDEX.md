# 📚 Documentação - Aplicativo de Gestão de eCommerce

**Projeto:** Controle Automático de Vendas para Shopee + Mercado Livre  
**Operação:** Perfumes Árabes  
**Status:** Planejamento Completo + Pronto para Implementação  
**Data:** 2026-08-01

---

## 📋 Índice de Documentos

### 🎯 COMECE AQUI (Leia em Ordem)

1. **[ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md)** ⭐ COMEÇAR AQUI
   - Visão completa do projeto em 4 fases
   - Timeline realista (8 semanas)
   - O que você vai ter no final de cada fase
   - Checklist e próximos passos
   - **Tempo de leitura:** 10 minutos

2. **[TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md)** - Análise Técnica
   - Todas as ~700 ações do Tiops categorizadas
   - Quais APIs usar para cada necessidade
   - Limitações e riscos mapeados
   - Arquitetura recomendada
   - **Tempo de leitura:** 20 minutos

3. **[Phase1_Implementation_Guide.md](./planejamento/Phase1_Implementation_Guide.md)** - Guia Prático
   - Passo-a-passo para criar Google Sheet
   - Código Apps Script completo
   - Fórmulas de cálculo detalhadas
   - Como testar e validar
   - **Tempo de leitura:** 15 minutos

---

## 🗂️ Estrutura de Arquivos

```
/docs
├── INDEX.md (este arquivo)
├── planejamento/
│   ├── ROADMAP_Executivo.md
│   ├── TIOPS_MCP_Analysis.md
│   ├── Phase1_Implementation_Guide.md
│   └── catalogo_mercado_livre.md
├── implementacao/
│   ├── apps-script/
│   │   ├── config.gs
│   │   ├── bling-sync.gs
│   │   ├── shopee-sync.gs
│   │   ├── calculadora.gs
│   │   └── utils.gs
│   └── google-sheets/
│       └── eCommerce-Manager-Template.gsheet
└── arquitetura/
    ├── diagrama-fluxo-dados.md
    ├── banco-dados.md
    └── api-endpoints.md
```

---

## 🚀 FASES DO PROJETO

### Fase 1: MVP - Calculadora de Preço (Semana 1-2)
**Status:** Pronto para implementar  
**Documentação:** [Phase1_Implementation_Guide.md](./planejamento/Phase1_Implementation_Guide.md)

**Entregáveis:**
- ✅ Google Sheet com calculadora automática
- ✅ Sincronização Bling (custo de compra)
- ✅ Sincronização Shopee (preços e estoque)
- ✅ Apps Script com automação diária

**Como começar:**
1. Leia: Phase1_Implementation_Guide.md
2. Crie um Google Sheet novo
3. Configure a API Key do Tiops
4. Copie o código Apps Script
5. Execute o teste

**Tempo:** 10-15 horas

---

### Fase 2: Dashboard de Vendas (Semana 3-4)
**Status:** Planejado, aguardando Fase 1

**Entregáveis:**
- ✅ Dashboard com vendas diárias
- ✅ Lucro/prejuízo por produto
- ✅ Análise de margem
- ✅ Top 5 produtos

**Documentação de referência:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 2"

**Tempo:** 15-20 horas

---

### Fase 3: Rastreamento de Ads (Semana 5-6)
**Status:** Planejado, aguardando Fase 2

**Entregáveis:**
- ✅ Central de controle de campanhas Shopee Ads
- ✅ Controle de campanhas Mercado Livre Ads
- ✅ ROI por campanha
- ✅ Alertas automáticos

**Documentação de referência:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 3"

**Tempo:** 20-25 horas

---

### Fase 4: Aplicativo Web (Semana 7-8 - Opcional)
**Status:** Planejado, aguardando Fase 3

**Entregáveis:**
- ✅ App web responsivo com React
- ✅ Dashboard em tempo real
- ✅ Backend Node.js
- ✅ Banco de dados Supabase

**Documentação de referência:**
- [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) - Seção "Fase 4"

**Tempo:** 30-40 horas

---

## 📊 Documentação por Necessidade de Negócio

### 1️⃣ Calculadora de Formação de Preço
**Objetivo:** Calcular preço de venda baseado no custo, com margem desejada

**Documentação:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 1"
- [Phase1_Implementation_Guide.md](./planejamento/Phase1_Implementation_Guide.md) - Seção "Aba Calculadora"

**APIs Utilizadas:**
- `bling_get_product` - Recuperar custo
- `shopee_update_price` - Atualizar preço

**Status:** ✅ Implementável em Fase 1

---

### 2️⃣ Controle de Lucro/Prejuízo por Produto
**Objetivo:** Saber se está tendo lucro ou prejuízo em cada produto

**Documentação:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 2"
- [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) - Seção "Fase 2"

**APIs Utilizadas:**
- `shopee_sales_by_item` - Vendas por produto
- `bling_get_product` - Custo
- `shopee_get_order_detail` - Detalhes de pedidos

**Status:** ✅ Implementável em Fase 2

---

### 3️⃣ Rastreamento de Gastos em Campanhas
**Objetivo:** Saber o ROI exato de cada campanha de publicidade

**Documentação:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 3"
- [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) - Seção "Fase 3"

**APIs Utilizadas:**
- `shopee_ads_campaigns` - Listar campanhas
- `shopee_ads_campaign_daily` - Gasto diário
- `shopee_ads_daily_performance` - Performance
- `ml_ads_campaigns` - Campanhas ML
- `ml_ads_metrics` - Métricas ML

**Status:** ✅ Implementável em Fase 3

---

### 4️⃣ Controle Geral da Operação
**Objetivo:** Dashboard executivo com visão completa do negócio

**Documentação:**
- [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 4"
- [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) - Seção "Fases"

**Status:** ✅ Implementável nas Fases 1-4

---

## 🛠️ Referência Técnica

### MCP Tiops - Ações Disponíveis

**Total:** ~700 ações  
**Marketplaces Suportados:**
- Shopee: 180+ ações ⭐ (Foco principal)
- Mercado Livre: 110+ ações
- Bling (ERP): 50+ ações
- Olist: 50+ ações
- Amazon: 40+ ações
- Shein: 30+ ações

**Mais detalhes:** [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Categorização das ~700 Ações"

---

## 📈 Stack Tecnológico Recomendado

### MVP (Fase 1-3): Google Sheets + Apps Script
```
Custo: Gratuito
Tempo Setup: 2-3 horas
Manutenção: ~30 min/semana
Escalabilidade: Até 100+ produtos
```

### Full Stack (Fase 4): React + Node.js + Supabase
```
Custo: ~R$ 0-50/mês
Tempo Setup: 30-40 horas
Manutenção: ~5 horas/semana
Escalabilidade: Ilimitada
```

**Comparação completa:** [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Arquitetura Recomendada"

---

## 📱 Seus Produtos Iniciais

### Em Operação Agora:
```
SW001 | Sabah Al Ward 100ml       | Custo: R$ 90    | Shopee: R$ 164.99
AE001 | Asad Elixir Lattafa 100ml | Custo: R$ 110   | Shopee: R$ 289.99
```

### Oportunidades Identificadas (Para Próximas Compras):
1. Lattafa Khamrah
2. Angham Second Song
3. Rayhaan Wolf
4. Al Wataniah Amnia
5. Maison Alhambra Apod Soirée
6. Lattafa Opulent Oud
7. Lattafa Qaed Al Sabah
8. Al Wataniah Musk Al Ward
9. Lattafa Musk Malaki

**Detalhes:** [catalogo_mercado_livre.md](./planejamento/catalogo_mercado_livre.md)

---

## ✅ Checklist de Implementação

### Antes de Começar Fase 1:
- [ ] Leia o ROADMAP_Executivo.md
- [ ] Leia o Phase1_Implementation_Guide.md
- [ ] Tenha uma API Key Tiops válida
- [ ] Tenha acesso ao Google Sheets
- [ ] Copie o código Apps Script para um novo sheet

### Durante Fase 1:
- [ ] Crie o Google Sheet template
- [ ] Configure a aba Configuração
- [ ] Teste sincronização Bling
- [ ] Teste sincronização Shopee
- [ ] Valide calculadora com 2-3 produtos
- [ ] Agende sincronização automática

### Após Fase 1:
- [ ] Adicione todos os seus produtos
- [ ] Valide preços calculados vs mercado
- [ ] Execute 1 semana de testes
- [ ] Inicie Fase 2

---

## 📞 Suporte e Referência Rápida

### "Como faço para..."

**...calcular o preço?**
→ [Phase1_Implementation_Guide.md](./planejamento/Phase1_Implementation_Guide.md) - Seção "Aba Calculadora"

**...sincronizar com Bling?**
→ [Phase1_Implementation_Guide.md](./planejamento/Phase1_Implementation_Guide.md) - Seção "Código Apps Script"

**...saber o ROI de uma campanha?**
→ [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Necessidade 3"

**...ver o lucro por produto?**
→ [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) - Seção "Fase 2"

**...entender como tudo funciona?**
→ [TIOPS_MCP_Analysis.md](./planejamento/TIOPS_MCP_Analysis.md) - Seção "Arquitetura Recomendada"

---

## 📊 Resumo Executivo

### O Problema
- Você vende em Shopee + Mercado Livre
- Não tem visibilidade de lucro/prejuízo por produto
- Não sabe o ROI real das campanhas de ads
- Precifica manualmente, sem base de dados

### A Solução
- Sistema automático que sincroniza dados de Shopee, ML e Bling
- Calculadora que gera preço ideal em segundos
- Dashboard que mostra lucro/prejuízo em tempo real
- Rastreamento de ROI de cada campanha

### O Resultado
- **Margem média esperada:** 45-50% (comparado aos ~30-35% sem controle)
- **Tempo economizado:** ~5-10 horas/semana
- **Decisões mais informadas:** Baseadas em dados, não em intuição
- **Escalabilidade:** Pronto para crescimento

### Timeline
- **Semana 1-2:** MVP (Calculadora)
- **Semana 3-4:** Dashboard de Vendas
- **Semana 5-6:** Controle de Ads
- **Semana 7-8:** App Web (Opcional)

### Investimento
- **Financeiro:** R$ 0 (plataformas gratuitas)
- **Tempo:** 75-100 horas de desenvolvimento
- **Manutenção:** ~30 min/semana

---

## 🚀 Próximos Passos

1. **Leia** o [ROADMAP_Executivo.md](./planejamento/ROADMAP_Executivo.md) (10 min)
2. **Decida** se quer começar pela Fase 1 agora
3. **Confirme** que tem API Key do Tiops
4. **Comunique** quando quer iniciar

**Pronto para começar?** → Fale com o Claude Code

---

## 📄 Versão dos Documentos

| Documento | Versão | Data | Status |
|-----------|--------|------|--------|
| ROADMAP_Executivo.md | 1.0 | 2026-08-01 | ✅ Pronto |
| TIOPS_MCP_Analysis.md | 1.0 | 2026-08-01 | ✅ Pronto |
| Phase1_Implementation_Guide.md | 1.0 | 2026-08-01 | ✅ Pronto |
| catalogo_mercado_livre.md | 1.0 | 2026-08-01 | ✅ Referência |

---

**Última atualização:** 2026-08-01  
**Próxima revisão:** Após Fase 1 concluída  
**Responsável:** Claude Code Team

