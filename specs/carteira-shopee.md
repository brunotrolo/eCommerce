# Spec: Carteira Shopee (CARTEIRA_SHOPEE)

## Status
Approved

## Objetivo

Centralizar todas as informações financeiras da carteira Shopee em uma aba do Google Sheets e exibir em dashboard integrado. Permite monitoramento de:
- Saldos (disponível, em escrow, total)
- Próximo payout (data, valor, método)
- Renda do período (vendas, comissões, taxas)
- Histórico de transações e pagamentos

Resolve o problema: usuário acompanha carteira fragmentada nos apps oficiais. Dashboard unificado em Sheets fornece visão 360° de saúde financeira da loja Shopee.

---

## Contrato da API Interna

### `carteiraShopee.syncWallet`
- **Descrição:** Sincroniza todos os dados da carteira Shopee via TIOPS e atualiza Sheets
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | forceFresh | boolean | não | false | Forçar atualização (ignorar cache) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    synced: {
      saldoAtualizado: boolean,
      payoutAtualizado: boolean,
      transacoesAtualizadas: number,
      timestamp: "2026-08-05T14:30:00Z"
    },
    dados: {
      saldoDisponivel: 1250.50,
      saldoEscrow: 500.00,
      saldoTotal: 1750.50,
      proximoPayout: { data: "2026-08-10", valor: 1250.50, metodo: "PIX" },
      rendaPeriodo: { periodo: "08/2026", total: 5000.00, comissoes: -1200.00, tarifas: -180.00 }
    },
    errors: []
  }
  ```

- **Erros esperados:**
  - `TIOPS_API_KEY_MISSING`: API key não configurada
  - `TIOPS_CALL_FAILED`: Shopee/TIOPS indisponível
  - `SHEETS_WRITE_FAILED`: Erro ao escrever em Sheets

### `carteiraShopee.getWalletSnapshot`
- **Descrição:** Retorna snapshot atual da carteira (cache ou fresh)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | fromCache | boolean | não | true | Usar cache (TTL 1h) se disponível |

- **Retorno:**
  ```javascript
  {
    saldo: {
      disponivel: 1250.50,
      escrow: 500.00,
      total: 1750.50
    },
    payout: {
      proximaData: "2026-08-10",
      proximoValor: 1250.50,
      metodo: "PIX",
      ultimoPagamento: { data: "2026-07-27", valor: 3200.00 }
    },
    renda: {
      periodo: "08/2026",
      vendas: 5000.00,
      comissao: -1200.00 (20% flat Shopee),
      taxasPlataforma: -180.00,
      liquido: 3620.00
    },
    atualizadoEm: "2026-08-05T14:30:00Z"
  }
  ```

### `carteiraShopee.getTransacoes`
- **Descrição:** Lista transações do período
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | limit | number | não | 50 | Máximo de transações |
  | tipo | string | não | — | Filtrar por tipo: "venda", "payout", "reembolso", "taxa" |

- **Retorno:** Array de transações com {transactionId, data, tipo, descricao, valor, saldoApos, status}

### `carteiraShopee.getPayoutHistory`
- **Descrição:** Histórico de pagamentos ao vendedor
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | limit | number | não | 12 | Últimos N pagamentos |

- **Retorno:** Array com {payoutId, data, valor, status, metodo, referencia}

---

## Abas no Google Sheets

### 1. Aba: CARTEIRA_SHOPEE (resumo, atualizado a cada sync)

```
DATA_SINCRONIZACAO | SALDO_DISPONIVEL | SALDO_ESCROW | SALDO_TOTAL | 
PROXIMO_PAYOUT_DATA | PROXIMO_PAYOUT_VALOR | METODO_PAYOUT | 
RENDA_PERIODO | COMISSAO_SHOPEE | TAXAS_PLATAFORMA | LIQUIDO_PERIODO | 
ULTIMO_PAYOUT_DATA | ULTIMO_PAYOUT_VALOR | STATUS_SINCRONIZACAO
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| DATA_SINCRONIZACAO | ISO 8601 | Quando foi atualizado (ex: 2026-08-05T14:30:00Z) |
| SALDO_DISPONIVEL | number | Saldo pronto para sacar (ex: 1250.50) |
| SALDO_ESCROW | number | Valor em garantia de pedidos (ex: 500.00) |
| SALDO_TOTAL | number | SALDO_DISPONIVEL + SALDO_ESCROW |
| PROXIMO_PAYOUT_DATA | DD/MM/YYYY | Data do próximo pagamento (ex: 10/08/2026) |
| PROXIMO_PAYOUT_VALOR | number | Valor do próximo payout (ex: 1250.50) |
| METODO_PAYOUT | string | PIX, Transferência Bancária, etc. |
| RENDA_PERIODO | number | Total de vendas do mês (ex: 5000.00) |
| COMISSAO_SHOPEE | number | Comissão descontada (-20% flat = -1000.00) |
| TAXAS_PLATAFORMA | number | Outras taxas (-180.00) |
| LIQUIDO_PERIODO | number | RENDA - COMISSAO - TAXAS (ex: 3820.00) |
| ULTIMO_PAYOUT_DATA | DD/MM/YYYY | Data do payout anterior |
| ULTIMO_PAYOUT_VALOR | number | Valor recebido no payout anterior |
| STATUS_SINCRONIZACAO | string | "OK", "ERRO", "PARCIAL", "PENDENTE" |

**Estrutura:** 1 linha = snapshot atual (sempre sobrescrever, nunca histórico)

### 2. Aba: CARTEIRA_HISTORICO_TRANSACOES (histórico, append-only)

```
DATA_TRANSACAO | TIPO_TRANSACAO | DESCRICAO | VALOR | SALDO_APOS | 
STATUS | REFERENCIA | DATA_REGISTRO
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| DATA_TRANSACAO | DD/MM/YYYY HH:MM | Quando ocorreu (ex: 05/08/2026 14:30) |
| TIPO_TRANSACAO | string | "Venda", "Payout", "Reembolso", "Taxa Plataforma", "Comissão" |
| DESCRICAO | string | Detalhe (ex: "Pedido #123456", "Payout PIX") |
| VALOR | number | Valor movimentado (positivo entrada, negativo saída) |
| SALDO_APOS | number | Saldo da carteira após a transação |
| STATUS | string | "Concluído", "Pendente", "Cancelado" |
| REFERENCIA | string | ID externo (transaction_id, order_id, payout_id) |
| DATA_REGISTRO | ISO 8601 | Quando foi registrado em Sheets |

**Estrutura:** Append-only, cresce a cada sincronização

### 3. Aba: CARTEIRA_HISTORICO_PAYOUT (histórico de pagamentos)

```
DATA_PAYOUT | VALOR | METODO | STATUS | REFERENCIA | DIAS_PARA_RECEBER | DATA_REGISTRO
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| DATA_PAYOUT | DD/MM/YYYY | Data do payout (ex: 27/07/2026) |
| VALOR | number | Valor pago (ex: 3200.00) |
| METODO | string | PIX, Transferência, Carteira Virtual, etc. |
| STATUS | string | "Concluído", "Processando", "Falhou", "Cancelado" |
| REFERENCIA | string | payout_id para rastreabilidade |
| DIAS_PARA_RECEBER | number | Quantos dias até receber (se processando) |
| DATA_REGISTRO | ISO 8601 | Quando foi registrado em Sheets |

**Estrutura:** Append-only (um payout por linha, nunca sobrescreve)

---

## Regras de Negócio

1. **Sincronização automática e manual:**
   - Manual: Botão "Sincronizar Carteira" dispara `syncWallet()` imediatamente
   - Automático: Trigger diário (midnight UTC) via CronTrigger.create()
   - TTL Cache: 1 hora (não fazer requisiões TIOPS a cada refresh de página)

2. **Comissão Shopee fixo:**
   - Shopee: 20% flat de todas as vendas (nenhuma variação por categoria)
   - Armazenar em Sheets como COMISSAO_SHOPEE = RENDA_PERIODO × -0.20

3. **Escrow não conta como saldo disponível:**
   - SALDO_DISPONIVEL: pronto para sacar agora
   - SALDO_ESCROW: bloqueado em garantia (liberado 15 dias pós-entrega)
   - SALDO_TOTAL: soma dos dois (informativo)

4. **Método de payout não exposto pela API (loja local BR):**
   - `payout_info`/`payout_detail` são Cross Border-only → **não há fonte** do método de
     pagamento para loja local. `METODO_PAYOUT` = `"PIX"` fixo (padrão Shopee BR),
     com nota na spec de que é valor de exibição, não dado da API.
   - Não logar warning de método (não há dado para comparar).

5. **Período de sincronização (fonte real = `shopee_get_escrow_list`):**
   - Sempre sincronizar o MÊS CORRENTE (08/2026, etc)
   - Histórico de transações: últimos 50-100 registros (via `wallet_transactions`)
   - Histórico de payouts: liberações de escrow **passadas** (~últimos 90 dias, janela
     `release_time_from/to` em epoch seconds)

6. **Invalidação de cache:**
   - Após cada `syncWallet()`, invalidar CacheService
   - Dashboard não mostra dados desincronizados

---

## Casos de Borda

- **Saldo negativo:** Rejeitar Shopee — impossível em carteira (aceitar e logar como anomalia)
- **Próximo payout em data passada:** Logar warning (pagamento atrasado ou pendente de processamento)
- **TIOPS indisponível:** Não falhar — retornar dados do cache com timestamp antigo + alerta na UI
- **Payout sem data confirmada:** Mostrar "Processando..." em vez de data específica
- **Primeira sincronização:** Criar as 3 abas automaticamente (já criadas se não existirem)
- **Transação duplicada (mesmo ID):** Ignorar (não re-inserir, TIOPS pode retornar mesmas transações)

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Sincronização bem-sucedida
```
Given: Usuário nunca sincronizou carteira antes
When: Clica botão "Sincronizar Carteira Shopee"
Then:
  - TIOPS retorna: saldo=1250.50, escrow=500, renda=5000, comissão=-1000, próximo payout 10/08
  - Aba CARTEIRA_SHOPEE tem 1 linha com todos os campos preenchidos
  - Toast: "Carteira sincronizada: R$1.250,50 disponível • R$500,00 em escrow"
  - STATUS_SINCRONIZACAO = "OK"
```

### Scenario 2: Cache funciona (não faz 2 chamadas TIOPS em 1 hora)
```
Given: Acabou de sincronizar (cache válido por 1h)
When: Recarrega a página e clica "Sincronizar" novamente
  E aguarda < 5 segundos
Then:
  - Retorna dados iguais instantaneamente (não chama TIOPS)
  - Toast: "Usando dados em cache (atualizado há 2 min)"
```

### Scenario 3: Histórico de transações append-only
```
Given: Já existem 5 transações em CARTEIRA_HISTORICO_TRANSACOES
When: Sincroniza carteira (TIOPS retorna 8 transações no período)
Then:
  - Aba tem 13 linhas (5 antigas + 8 novas, sem duplicatas)
  - Campos: DATA_TRANSACAO, TIPO_TRANSACAO, VALOR, STATUS, REFERENCIA preenchidos
```

### Scenario 4: Payout dentro de X dias
```
Given: Próximo payout em 2026-08-10
When: Hoje é 2026-08-05
Then:
  - PROXIMO_PAYOUT_DATA = "10/08/2026"
  - PROXIMO_PAYOUT_VALOR = 1250.50
  - Dashboard mostra: "Payout em 5 dias: R$1.250,50"
```

### Scenario 5: Sincronização parcial (TIOPS retorna erro)
```
Given: TIOPS indisponível
When: Clica "Sincronizar"
Then:
  - Retorna {success: false, errors: ["TIOPS_CALL_FAILED"]}
  - STATUS_SINCRONIZACAO = "ERRO"
  - Toast: "Erro ao sincronizar. Usando dados em cache de X horas atrás."
  - Dashboard mostra último snapshot conhecido (não limpa)
```

---

## Fora de Escopo (v1)

- Previsão de renda futura (ML, tendências)
- Alertas de payout (SMS, email)
- Saques manuais (integração com Shopee API de transferência)
- Reconciliação com extrato bancário
- Múltiplas lojas Shopee (apenas 1 loja por projeto v1)
- Dashboard financeiro avançado (análise por categoria, por período)

---

## Dependências

### Services
- `TiopsClient` — chamar ações TIOPS de carteira
- `ConfigService` — shopId, sheet ID, timezone

### Repositories
- `CarteiraShopeeRepository` (novo) — ler/escrever abas CARTEIRA_*

### Google Apps Script
- `SpreadsheetApp` — acesso às 3 abas
- `CacheService` — cache com TTL 1h
- `CronTrigger` ou `ScriptApp.newTrigger()` — sync automático diário

### Ações TIOPS (contrato confirmado em 2026-08-05 — ver CONTRATOS_CONFIRMADOS.md)
- `shopee_get_escrow_list` — liberações de escrow (`release_time_from/to` em **epoch seconds** + `page_size`) → próximo payout + histórico de pagamentos + saldo em escrow
- `shopee_get_income_overview` — renda líquida do mês (`timestamp` epoch fim do mês + `shop_id`) → `released_amount`
- `shopee_get_wallet_transactions` — histórico de transações + saldo da carteira (`page_size` + `shopId`) → `current_balance` da transação mais recente
- **Não usar** `shopee_get_payout_info`/`shopee_get_payout_detail`: exclusivas de sellers **Cross Border (CB)** — loja é local BR, chamada sempre falha
- Parâmetro obrigatório: `shopId` (`ConfigService.getAccountId('shopee')`), exceto `shopee_get_income_overview` que usa `shop_id`

---

## Notas de Implementação

### Estrutura de arquivos
```
src/03_services/carteiraShopee/
├── CarteiraShopeeService.js       # Orquestração
└── CarteiraShopeeRepository.js    # I/O Sheets

ui/carteiraShopee/
└── CarteiraShopeeView.html        # Dashboard / card view
```

### Inicialização de abas
```javascript
function initializeSheets() {
  var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
  
  // Aba 1: CARTEIRA_SHOPEE (resumo)
  if (!ss.getSheetByName('CARTEIRA_SHOPEE')) {
    var sheet = ss.insertSheet('CARTEIRA_SHOPEE');
    sheet.appendRow([
      'DATA_SINCRONIZACAO', 'SALDO_DISPONIVEL', 'SALDO_ESCROW', 'SALDO_TOTAL',
      'PROXIMO_PAYOUT_DATA', 'PROXIMO_PAYOUT_VALOR', 'METODO_PAYOUT',
      'RENDA_PERIODO', 'COMISSAO_SHOPEE', 'TAXAS_PLATAFORMA', 'LIQUIDO_PERIODO',
      'ULTIMO_PAYOUT_DATA', 'ULTIMO_PAYOUT_VALOR', 'STATUS_SINCRONIZACAO'
    ]);
  }
  
  // Aba 2: CARTEIRA_HISTORICO_TRANSACOES (append-only)
  if (!ss.getSheetByName('CARTEIRA_HISTORICO_TRANSACOES')) {
    var sheet = ss.insertSheet('CARTEIRA_HISTORICO_TRANSACOES');
    sheet.appendRow([
      'DATA_TRANSACAO', 'TIPO_TRANSACAO', 'DESCRICAO', 'VALOR', 'SALDO_APOS',
      'STATUS', 'REFERENCIA', 'DATA_REGISTRO'
    ]);
  }
  
  // Aba 3: CARTEIRA_HISTORICO_PAYOUT (append-only)
  if (!ss.getSheetByName('CARTEIRA_HISTORICO_PAYOUT')) {
    var sheet = ss.insertSheet('CARTEIRA_HISTORICO_PAYOUT');
    sheet.appendRow([
      'DATA_PAYOUT', 'VALOR', 'METODO', 'STATUS', 'REFERENCIA',
      'DIAS_PARA_RECEBER', 'DATA_REGISTRO'
    ]);
  }
}
```

### Cache Strategy
```javascript
function getWalletSnapshot(fromCache) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'shopee_wallet_snapshot';
  
  if (fromCache) {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }
  
  // Fresh sync
  var data = syncWallet({forceFresh: true});
  cache.put(cacheKey, JSON.stringify(data.dados), 3600); // TTL 1h
  return data.dados;
}
```

### Mapeamento de dados (contrato Tiops confirmado — usar exatamente estes campos)

| Campo do serviço | Fonte Tiops | Transformação |
|---|---|---|
| `saldoDisponivel` | `shopee_get_wallet_transactions.transaction_list[]` | `current_balance` da transação **mais recente** (maior `create_time`) |
| `saldoEscrow` | `shopee_get_escrow_list.escrow_list[]` | Soma de `payout_amount` onde `escrow_release_time` é **futuro** |
| `saldoTotal` | — | `saldoDisponivel + saldoEscrow` |
| `proximoPayout.data` | `shopee_get_escrow_list.escrow_list[]` | Menor `escrow_release_time` **futuro** (converter epoch→data) |
| `proximoPayout.valor` | `shopee_get_escrow_list.escrow_list[]` | Soma dos `payout_amount` com liberações futuras |
| `proximoPayout.metodo` | — | `"PIX"` fixo (ver Regra 4; API não expõe para local BR) |
| `rendaPeriodo.liquido` | `shopee_get_income_overview` | `response.total_income.released_amount` (valor real já líquido de taxas) |
| `rendaPeriodo.total` | — | `liquido / 0.80` (bruto estimado pela regra 20% flat; ver Regra 2) |
| `rendaPeriodo.comissoes` | — | `total × -0.20` (regra 20% flat Shopee em AGENTS.md) |
| `rendaPeriodo.tarifas` | — | `0` (não exposto pela API; sem valor granular) |
| Histórico de payouts | `escrow_list` | Liberações **passadas**: `escrow_release_time` → `DATA_PAYOUT`, `payout_amount` → `VALOR`, `order_sn` → `REFERENCIA` |
| Histórico de transações | `wallet_transactions` | `transaction_id` (REFERENCIA), `create_time`→data, `description`, `amount`, `status`, `money_flow` |

**Filtro escrow:** `release_time_from`/`release_time_to` em **epoch seconds** (ms são rejeitados). Janela padrão: `from = now - 90d`, `to = now + 30d` para capturar futuro próximo.

### Trigger automático diário
```javascript
function setupDailySync() {
  // Remove triggers existentes
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncCarteiraDaily') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Novo trigger: todo dia 00:00 UTC
  ScriptApp.newTrigger('syncCarteiraDaily')
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();
}

function syncCarteiraDaily() {
  CarteiraShopeeService.syncWallet({forceFresh: true});
  Logger.log('Carteira sincronizada diariamente');
}
```

---

## Teste de Aceitação

No browser:
- Widget "Carteira Shopee" aparece em página dedicada ✅
- Botão "Sincronizar" existe e funciona ✅
- Mostra: saldo disponível, em escrow, total ✅
- Mostra: próximo payout (data + valor) ✅
- Mostra: renda do mês + comissão descontada ✅
- Toast com resultado: "Sincronizado: R$X,XXX disponível" ✅
- Cache funciona: segunda chamada < 1s (sem TIOPS) ✅
- Histórico de transações (últimas 10) aparece abaixo ✅
- Histórico de payouts (últimos 3 meses) aparece ✅
- Erro TIOPS → mostra dados do cache com alerta ✅
- Abas Sheets criadas automaticamente ✅
- Dados sync persistem em Sheets (releitura confirma) ✅
