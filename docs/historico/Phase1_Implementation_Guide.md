# FASE 1: Implementação - Calculadora de Preço + Sincronização MVP

**Timeline:** Semana 1-2 (10-15 horas de trabalho)  
**Objetivo:** Ter uma planilha funcional que calcule preço de venda baseado no custo e sincronize com Shopee

---

## PASSO 1: Criar Google Sheet Template

### 1.1 Criar novo Google Sheet
1. Acesse: https://sheets.google.com
2. Clique em "Planilha em branco"
3. Renomeie para: **"eCommerce Manager - Perfumes Árabes"**

### 1.2 Estrutura Inicial de Abas

```
[Configuração] [Produtos] [Calculadora] [Vendas] [Dashboard] [Logs]
```

---

## PASSO 2: Aba "Configuração"

### 2.1 Template de Configuração

```
┌─────────────────────────────────────────────────────────┐
│ A                              │ B                      │
├─────────────────────────────────────────────────────────┤
│ CONFIGURAÇÃO GERAL              │                       │
├─────────────────────────────────────────────────────────┤
│ 1. API Key Tiops                │ [COLAR AQUI]          │
│ 2. Email Notificação            │ brunotrolo@gmail.com  │
│ 3. Moeda                        │ BRL                   │
├─────────────────────────────────────────────────────────┤
│ MARGENS E TAXAS                 │                       │
├─────────────────────────────────────────────────────────┤
│ 4. Margem Desejada (%)          │ 20%                   │
│ 5. Taxa Shopee (%)              │ 4%                    │
│ 6. Taxa Mercado Livre (%)       │ 12%                   │
│ 7. Imposto Estimado (%)         │ 15%                   │
│ 8. Gasto Medio Ads por Un (%)   │ 2% do preço          │
├─────────────────────────────────────────────────────────┤
│ DADOS SHOPEE                    │                       │
├─────────────────────────────────────────────────────────┤
│ 9. Shop ID Shopee               │ [NUMERIC ID]          │
│ 10. Access Token Shopee         │ [TOKEN]               │
├─────────────────────────────────────────────────────────┤
│ DADOS BLING                     │                       │
├─────────────────────────────────────────────────────────┤
│ 11. Chave API Bling             │ [API KEY]             │
├─────────────────────────────────────────────────────────┤
│ SINCRONIZAÇÃO                   │                       │
├─────────────────────────────────────────────────────────┤
│ 12. Última Sincronização        │ 2026-08-01 10:30     │
│ 13. Status Última Sync          │ ✓ Sucesso             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Validação de Dados

Em B1, adicione validação:
- Tipo: Texto personalizado
- Critério: `REGEX("^[a-zA-Z0-9\-_]{40,}$")`
- Mensagem: "Formato de API Key inválido"

---

## PASSO 3: Aba "Produtos"

### 3.1 Template de Produtos

```
┌────────────────────────────────────────────────────────────────────────────┐
│ A    │ B              │ C      │ D         │ E         │ F      │ G       │
├────────────────────────────────────────────────────────────────────────────┤
│ SKU  │ Nome Produto   │ Custo  │ Preço_SH  │ Preço_ML  │ Estoque│ Atualiz │
├────────────────────────────────────────────────────────────────────────────┤
│      │                │        │           │           │        │         │
│ SW001│ Sabah Al Ward  │ 90.00  │ 164.99    │ 169.99    │ 15     │ 2026-08-01│
│ AE001│ Asad Elixir    │ 110.00 │ 289.99    │ 299.99    │ 8      │ 2026-08-01│
│      │                │        │           │           │        │         │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fórmulas Iniciais

**Coluna H: Preço Calculado (Calculadora)** [SERÁ ALIMENTADA PELA FASE 1]

```
Fórmula em H2:
=ROUND(
  (C2 * (1 + INDEX($Configuração.$B$7,1)) * (1 + INDEX($Configuração.$B$4,1)))
  / (1 - INDEX($Configuração.$B$5,1))
, 2)
```

Que significa:
```
= (Custo × (1 + Imposto %) × (1 + Margem %)) / (1 - Taxa Shopee %)
```

### 3.3 Dados Iniciais (Adicionar manualmente agora)

```
SW001 | Sabah Al Ward  | 90.00  
AE001 | Asad Elixir    | 110.00
```

---

## PASSO 4: Aba "Calculadora"

### 4.1 Layout - Calculadora Interativa

```
┌──────────────────────────────────────────────────────────┐
│ CALCULADORA DE FORMAÇÃO DE PREÇO                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 1. Selecione o Produto:                                │
│    [Dropdown: Sabah Al Ward ▼]                         │
│                                                          │
│ 2. Dados do Produto:                                   │
│    ├─ Preço de Compra:     R$ 90.00 (auto-preenchido) │
│    ├─ Fornecedor:          [NOME] (ref)               │
│    └─ Data Última Compra:  2026-07-20                 │
│                                                          │
│ 3. Ajuste Parâmetros:                                  │
│    ├─ Margem Desejada:     [20] % (editável)          │
│    ├─ Gasto Ads por Unid:  R$ [2.50] (editável)       │
│    └─ Taxa Plataforma:     [4] % (editável)           │
│                                                          │
│ 4. CÁLCULO RESULTANTE:                                 │
│    ├─ Custo Produto:       R$ 90.00                    │
│    ├─ Gasto Ads/Un:        R$ 2.50                     │
│    ├─ Imposto (15%):       R$ 13.50                    │
│    ├─ Subtotal:            R$ 106.00                   │
│    ├─ Comissão Shopee:     R$ 4.24 (4%)               │
│    ├─ Total Custo:         R$ 110.24                   │
│    └─ ─────────────────────                            │
│    └─ PREÇO RECOMENDADO:   R$ 165.00 (com 20% margem)│
│                                                          │
│ 5. COMPARAÇÃO COM MERCADO:                             │
│    ├─ Shopee Atual:        R$ 164.99  ✓ Compatível   │
│    ├─ ML Atual:            R$ 169.99  ✓ Compatível   │
│    └─ Margem Esperada:     20%                        │
│                                                          │
│ 6. APLICAR:                                            │
│    ├─ [Atualizar Shopee] [Atualizar ML] [Copiar Célula]
│    └─ Status: Pronto para aplicar                     │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Implementação em Sheets

**Células da Calculadora:**
```
A1: "CALCULADORA DE FORMAÇÃO DE PREÇO"
A3: "Produto Selecionado:"
B3: [Validação com Dropdown apontando para Produtos!A:A]

A5: "PRODUTO"
B5: =VLOOKUP(B3, Produtos!A:D, 2, 0)

A6: "Preço de Compra:"
B6: =VLOOKUP(B3, Produtos!A:C, 3, 0)

A8: "PARÂMETROS"
A9: "Margem Desejada (%):"
B9: 20 [Permite edição]

A10: "Gasto Ads por Unidade:"
B10: 2.50 [Permite edição]

A12: "CÁLCULO"
A13: "Custo Produto:"
B13: =B6

A14: "Gasto Ads/Unidade:"
B14: =B10

A15: "Imposto (15%):"
B15: =B13 * 0.15

A16: "Subtotal Custo:"
B16: =B13 + B14 + B15

A17: "Comissão Shopee (4%):"
B17: =B16 * 0.04

A18: "Total Custo:"
B18: =B16 + B17

A20: "PREÇO RECOMENDADO:"
B20: =ROUND(B18 / (1 - 0.20), 2)
    [Formula: (Total Custo) / (1 - Margem %)
    Esta fórmula garante 20% de margem sobre o preço final]

A22: "COMPARAÇÃO COM MERCADO"
A23: "Shopee Atual:"
B23: =VLOOKUP(B3, Produtos!A:D, 4, 0)

A24: "ML Atual:"
B24: =VLOOKUP(B3, Produtos!A:D, 5, 0)

A25: "Diferença vs Recomendado:"
B25: =B20 - B23 [Positivo = Margem aumentar | Negativo = Margem diminuir]
```

---

## PASSO 5: Integração com Apps Script (MCP Tiops)

### 5.1 Criar Script

1. Na planilha, clique em **Extensões → Apps Script**
2. Copie o código abaixo no editor

### 5.2 Código Apps Script Básico

```javascript
// ============================================
// CONFIGURAÇÃO INICIAL
// ============================================

const TIOPS_API_BASE = 'https://api.tiops.app/v1'; // Endpoint base Tiops
const SHEET_ID = SpreadsheetApp.getActive().getId();
const ss = SpreadsheetApp.getActive();

function obterConfiguracao() {
  const configSheet = ss.getSheetByName('Configuração');
  return {
    apiKey: configSheet.getRange('B1').getValue(),
    emailNotificacao: configSheet.getRange('B2').getValue(),
    moeda: configSheet.getRange('B3').getValue(),
    margemDesejada: configSheet.getRange('B4').getValue() / 100,
    taxaShopee: configSheet.getRange('B5').getValue() / 100,
    taxaML: configSheet.getRange('B6').getValue() / 100,
    impostoEstimado: configSheet.getRange('B7').getValue() / 100,
  };
}

// ============================================
// 1. SINCRONIZAR PRODUTOS DO BLING
// ============================================

function sincronizarProdutosBling() {
  const config = obterConfiguracao();
  const sheet = ss.getSheetByName('Produtos');
  
  try {
    // Chamar Tiops MCP para bling_get_product
    const response = UrlFetchApp.fetch(`${TIOPS_API_BASE}/bling/products`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = JSON.parse(response.getContentText());
    
    // Limpar dados antigos (deixar headers)
    const numRows = sheet.getLastRow() - 1;
    if (numRows > 1) {
      sheet.deleteRows(2, numRows);
    }
    
    // Preencher dados novos
    let row = 2;
    data.products.forEach((product) => {
      sheet.getRange(row, 1).setValue(product.sku || '');
      sheet.getRange(row, 2).setValue(product.name || '');
      sheet.getRange(row, 3).setValue(parseFloat(product.cost) || 0);
      // Colunas 4 e 5 (Preço Shopee e ML) serão preenchidas na próxima função
      sheet.getRange(row, 6).setValue(product.stock || 0);
      sheet.getRange(row, 7).setValue(new Date());
      row++;
    });
    
    registrarLog(`✓ Sincronização Bling: ${data.products.length} produtos`);
    
  } catch (error) {
    registrarLog(`✗ Erro Bling: ${error.message}`);
    throw error;
  }
}

// ============================================
// 2. SINCRONIZAR PREÇOS SHOPEE
// ============================================

function sincronizarPrecosShopee() {
  const config = obterConfiguracao();
  const sheet = ss.getSheetByName('Produtos');
  
  try {
    const response = UrlFetchApp.fetch(`${TIOPS_API_BASE}/shopee/items/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = JSON.parse(response.getContentText());
    
    // Mapear preços Shopee para SKUs
    const lastRow = sheet.getLastRow();
    for (let i = 2; i <= lastRow; i++) {
      const sku = sheet.getRange(i, 1).getValue();
      
      // Buscar item no Shopee por SKU
      const shopeeItem = data.items.find(item => 
        (item.sku === sku || item.item_name === sheet.getRange(i, 2).getValue())
      );
      
      if (shopeeItem) {
        sheet.getRange(i, 4).setValue(shopeeItem.price || 0); // Coluna D: Preço Shopee
        sheet.getRange(i, 6).setValue(shopeeItem.stock || 0); // Coluna F: Estoque
      }
    }
    
    registrarLog(`✓ Sincronização Shopee: Preços atualizados`);
    
  } catch (error) {
    registrarLog(`✗ Erro Shopee: ${error.message}`);
  }
}

// ============================================
// 3. REGISTRAR LOG DE OPERAÇÕES
// ============================================

function registrarLog(mensagem) {
  const logsSheet = ss.getSheetByName('Logs') || ss.insertSheet('Logs');
  const lastRow = logsSheet.getLastRow() + 1;
  
  logsSheet.getRange(lastRow, 1).setValue(new Date());
  logsSheet.getRange(lastRow, 2).setValue(mensagem);
}

// ============================================
// 4. ATUALIZAR PREÇO NO SHOPEE
// ============================================

function atualizarPrecoShopee(sku, novoPreco) {
  const config = obterConfiguracao();
  
  try {
    const payload = {
      sku: sku,
      price: parseFloat(novoPreco)
    };
    
    const response = UrlFetchApp.fetch(`${TIOPS_API_BASE}/shopee/item/update-price`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    });
    
    const result = JSON.parse(response.getContentText());
    registrarLog(`✓ Preço atualizado no Shopee: ${sku} = R$ ${novoPreco}`);
    return result.success;
    
  } catch (error) {
    registrarLog(`✗ Erro ao atualizar Shopee: ${error.message}`);
    return false;
  }
}

// ============================================
// 5. TRIGGER AUTOMÁTICO (Agendado)
// ============================================

function agendarSincronizacao() {
  // Remover triggers existentes
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sincronizarDiario') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Criar novo trigger para executar diariamente às 00:05
  ScriptApp.newTrigger('sincronizarDiario')
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .everyDays(1)
    .create();
  
  registrarLog('✓ Sincronização agendada: Diariamente às 00:05 UTC-3');
}

function sincronizarDiario() {
  Logger.log('Iniciando sincronização diária...');
  sincronizarProdutosBling();
  sincronizarPrecosShopee();
  
  // Atualizar status na configuração
  const configSheet = ss.getSheetByName('Configuração');
  configSheet.getRange('B12').setValue(new Date());
  configSheet.getRange('B13').setValue('✓ Sucesso');
}

// ============================================
// 6. TESTE RÁPIDO
// ============================================

function testarIntegracao() {
  const config = obterConfiguracao();
  Logger.log('Config:', config);
  Logger.log('API Key (primeiros 10 chars):', config.apiKey.substring(0, 10) + '...');
  
  // Teste simples de conexão
  try {
    sincronizarProdutosBling();
    Logger.log('✓ Teste de integração bem-sucedido');
  } catch (error) {
    Logger.log('✗ Erro no teste:', error.message);
  }
}
```

### 5.3 Como Usar

1. **Testar integração:**
   - Coloque sua API Key do Tiops em B1 da aba Configuração
   - Na aba Apps Script, clique em ▶️ **Executar** próximo a `testarIntegracao`
   - Verifique o Log (Extensions → Apps Script → Execution Log)

2. **Agendar sincronização automática:**
   - Execute a função `agendarSincronizacao()` uma única vez
   - Daí em diante, rodará automaticamente às 00:05 UTC-3 todo dia

3. **Sincronizar manualmente:**
   - Clique em **Extensões → Apps Script**
   - Selecione a função desejada
   - Clique em ▶️ **Executar**

---

## PASSO 6: Testar com Dados Reais

### 6.1 Dados de Teste

Use os produtos que você já tem cadastrados:

```
SKU    | Nome                  | Custo | Shopee  | ML
-------|----------------------|-------|---------|-------
SW001  | Sabah Al Ward 100ml  | 90.00 | 164.99  | 169.99
AE001  | Asad Elixir 100ml    | 110.00| 289.99  | 299.99
```

### 6.2 Validações

1. ✅ Aba Configuração preenchida com API Key
2. ✅ Aba Produtos com SKUs e nomes corretos
3. ✅ Aba Calculadora calcula preço corretamente
4. ✅ Log de sincronização mostra sucessos/erros
5. ✅ Preços no Sheets correspondem aos marketplaces

---

## PASSO 7: Estrutura de Pastas (para Futuro)

Quando implementar o App completo:

```
eCommerce-Manager/
├── sheets/
│   ├── eCommerce Manager - Template.gsheet
│   └── Apps Script/
│       ├── config.gs
│       ├── bling.gs
│       ├── shopee.gs
│       ├── mercadolivre.gs
│       ├── calculadora.gs
│       ├── dashboard.gs
│       └── utils.gs
├── backend/ (Opcional - para App Web)
│   ├── server.js
│   ├── tiops-client.js
│   └── routes/
└── frontend/ (Opcional)
    └── React App
```

---

## CRONOGRAMA FASE 1

### Dia 1: Configuração
- [ ] Criar Google Sheet
- [ ] Preencher aba Configuração
- [ ] Estruturar abas Produtos e Calculadora
- [ ] Obter API Key Tiops

### Dia 2-3: Implementação Apps Script
- [ ] Copiar código Apps Script
- [ ] Conectar funções Bling
- [ ] Conectar funções Shopee
- [ ] Testar integrações

### Dia 4-5: Teste e Validação
- [ ] Adicionar dados reais (SW001, AE001)
- [ ] Validar fórmulas de cálculo
- [ ] Testar atualização de preços
- [ ] Agendar sincronização automática

### Dia 6-7: Ajustes Finais
- [ ] Adicionar mais produtos (próximas oportunidades)
- [ ] Documentar fórmulas
- [ ] Criar manual de uso
- [ ] Revisar antes de Fase 2

---

## Próximo Passo

Após completar FASE 1 com sucesso:
→ Passamos para **FASE 2: Dashboard de Vendas + Controle de Lucro**

**Deseja que eu comece a ajudá-lo com a implementação?**
