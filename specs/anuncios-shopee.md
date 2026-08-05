# Spec: Anúncios Shopee (ANUNCIOS_SHOPEE)

## Status
Approved

## Objetivo

Centralizar gerenciamento de todos os anúncios (items/listings) da loja Shopee em uma aba do Google Sheets com sincronização TIOPS. Permite:
- Visão consolidada de todos os anúncios (ativo, pausado, deletado)
- Monitoramento de preço, estoque, vendas por item
- Atualização rápida de preço e estoque
- Histórico de alterações
- Dashboard de performance (vendas, avaliação, qualidade)

Resolve o problema: usuário gerencia anúncios fragmentados entre Shopee app, Sheets manual, e aqui no painel unificado.

---

## Contrato da API Interna

### `anunciosShopee.syncListings`
- **Descrição:** Sincroniza todos os anúncios da Shopee via TIOPS e atualiza Sheets
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | forceFresh | boolean | não | false | Forçar atualização (ignorar cache) |
  | categoria | string | não | — | Filtrar por categoria (se omitir, sincroniza tudo) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    synced: {
      itemsAtualizados: number,
      novosCriados: number,
      pausados: number,
      deletados: number,
      timestamp: "2026-08-05T14:30:00Z"
    },
    resumo: {
      totalAtivos: 15,
      totalPausados: 2,
      estoqueTotal: 125,
      vendasPeriodo: 450,
      avaliacaoMedia: 4.8
    },
    errors: []
  }
  ```

### `anunciosShopee.getItemDetail`
- **Descrição:** Busca detalhes completos de um item (incluindo variações, imagens, promoções)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | itemId | string | sim | — | ID do item na Shopee |

- **Retorno:** Objeto completo com todos os campos do item

### `anunciosShopee.updatePrice`
- **Descrição:** Atualiza preço de um ou múltiplos items
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | itemIds | array | sim | — | IDs dos items a atualizar |
  | priceList | array | sim | — | Array [{itemId, preço}] ou [{itemId, variacoes: [{modelId, preço}]}] |

- **Retorno:** {success, atualizado: N, falhas: [{itemId, motivo}]}

### `anunciosShopee.updateStock`
- **Descrição:** Atualiza estoque de um ou múltiplos items
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | itemIds | array | sim | — | IDs dos items |
  | stockList | array | sim | — | Array [{itemId, quantidade}] ou [{itemId, modelos: [{modelId, quantidade}]}] |

- **Retorno:** {success, atualizado: N, falhas: [{itemId, motivo}]}

### `anunciosShopee.pauseItem`
- **Descrição:** Pausa um anúncio
- **Params:**
  | Nome | Tipo | Obr. | Descrição |
  |------|------|------|-----------|
  | itemId | string | sim | ID do item |

- **Retorno:** {success, itemId, novoStatus: "pausado"}

### `anunciosShopee.activateItem`
- **Descrição:** Ativa um anúncio pausado
- **Params:**
  | Nome | Tipo | Obr. | Descrição |
  |------|------|------|-----------|
  | itemId | string | sim | ID do item |

- **Retorno:** {success, itemId, novoStatus: "ativo"}

### `anunciosShopee.deleteItem`
- **Descrição:** Deleta um anúncio
- **Params:**
  | Nome | Tipo | Obr. | Descrição |
  |------|------|------|-----------|
  | itemId | string | sim | ID do item |

- **Retorno:** {success, itemId, novoStatus: "deletado"}

### `anunciosShopee.getSalesMetrics`
- **Descrição:** Retorna métricas de vendas e performance
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | itemId | string | não | — | Se omitir, retorna agregado de todos |
  | periodo | string | não | "30d" | Período: "7d", "30d", "90d" |

- **Retorno:**
  ```javascript
  {
    vendasTotal: 450,
    contagemPedidos: 120,
    avaliacaoMedia: 4.8,
    comentariosTotal: 45,
    visitas: 2500,
    conversao: "4.8%"
  }
  ```

### `anunciosShopee.getSKUs`
- **Descrição:** Lista SKUs/variações de um item
- **Params:**
  | Nome | Tipo | Obr. | Descrição |
  |------|------|------|-----------|
  | itemId | string | sim | ID do item |

- **Retorno:** Array com {modelId, nomeSKU, preco, estoque}

---

## Abas no Google Sheets

### 1. Aba: ANUNCIOS_SHOPEE (inventário master)

```
ITEM_ID | NOME | CATEGORIA | PRECO | ESTOQUE | STATUS | 
DATA_CRIACAO | DATA_ATUALIZACAO | IMAGEM_URL | LINK_SHOPEE | 
VENDAS_30D | AVALIACAO | NUM_COMENTARIOS | TIPO_VARIACAO | 
ORIGINAL_PRICE | MOEDA | ATIVO_OUTLET | DADOS_JSON | DATA_SINCRONIZACAO
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| ITEM_ID | string | ID único do item na Shopee (ex: "123456789") |
| NOME | string | Título do anúncio (ex: "Maison Delilah - Camiseta") |
| CATEGORIA | string | Categoria Shopee (ex: "Moda > Camisetas") |
| PRECO | number | Preço de venda (ex: 89.90) |
| ESTOQUE | number | Quantidade em estoque (ex: 15) |
| STATUS | string | "ativo", "pausado", "deletado" |
| DATA_CRIACAO | DD/MM/YYYY | Quando foi criado o anúncio |
| DATA_ATUALIZACAO | DD/MM/YYYY HH:MM | Última atualização |
| IMAGEM_URL | string | URL da primeira imagem |
| LINK_SHOPEE | string | Link público do anúncio (shopee.com.br/...) |
| VENDAS_30D | number | Vendas últimos 30 dias |
| AVALIACAO | number | Nota média (ex: 4.8, de 0 a 5) |
| NUM_COMENTARIOS | number | Total de comentários/reviews |
| TIPO_VARIACAO | string | "sem_variacao", "1_nivel", "2_niveis" |
| ORIGINAL_PRICE | number | Preço original (antes de desconto, se houver) |
| MOEDA | string | Sempre "BRL" |
| ATIVO_OUTLET | boolean | true se está no outlet shop, false se não |
| DADOS_JSON | string | Backup JSON completo (para referência/edição futura) |
| DATA_SINCRONIZACAO | ISO 8601 | Quando foi sincronizado em Sheets |

**Estrutura:** Uma linha por item (upsert: atualiza se existe, insere se novo)

### 2. Aba: ANUNCIOS_HISTORICO_PRECOS (append-only)

```
ITEM_ID | NOME_ITEM | PRECO_ANTIGO | PRECO_NOVO | DATA_MUDANCA | USUARIO | REFERENCIA
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| ITEM_ID | string | ID do item |
| NOME_ITEM | string | Nome do item (snapshot no momento da mudança) |
| PRECO_ANTIGO | number | Preço anterior |
| PRECO_NOVO | number | Novo preço |
| DATA_MUDANCA | DD/MM/YYYY HH:MM | Quando foi mudado |
| USUARIO | string | "Sistema" (se via sync TIOPS) ou nome do usuário se manual |
| REFERENCIA | string | sync_id ou manual para rastreabilidade |

**Estrutura:** Append-only (histórico cresce, nunca sobrescreve)

### 3. Aba: ANUNCIOS_HISTORICO_ESTOQUE (append-only)

```
ITEM_ID | NOME_ITEM | ESTOQUE_ANTIGO | ESTOQUE_NOVO | MUDANCA | 
DATA_MUDANCA | MOTIVO | REFERENCIA
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| ITEM_ID | string | ID do item |
| NOME_ITEM | string | Nome do item |
| ESTOQUE_ANTIGO | number | Quantidade anterior |
| ESTOQUE_NOVO | number | Quantidade nova |
| MUDANCA | number | Diferença (positivo/negativo) |
| DATA_MUDANCA | DD/MM/YYYY HH:MM | Quando foi mudado |
| MOTIVO | string | "Venda", "Ajuste Manual", "Entrada Manual", "Entrada NF", etc. |
| REFERENCIA | string | order_id, manual_id, nf_id, etc. |

**Estrutura:** Append-only (auditoria de estoque)

### 4. Aba: ANUNCIOS_PERFORMANCE (resumo agregado, atualizado a cada sync)

```
PERIODO | TOTAL_ANUNCIOS_ATIVOS | TOTAL_ESTOQUE | VENDAS_TOTAL | 
PEDIDOS_TOTAL | AVALIACAO_MEDIA | COMENTARIOS_TOTAL | VISITAS_TOTAL | 
TAXA_CONVERSAO | DATA_SINCRONIZACAO
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| PERIODO | string | "30d" ou mês/ano (ex: "08/2026") |
| TOTAL_ANUNCIOS_ATIVOS | number | Quantos items estão ativos |
| TOTAL_ESTOQUE | number | Soma de todos os estoques |
| VENDAS_TOTAL | number | Soma de vendas do período |
| PEDIDOS_TOTAL | number | Total de pedidos do período |
| AVALIACAO_MEDIA | number | Média de todas as avaliações |
| COMENTARIOS_TOTAL | number | Total de comentários/reviews |
| VISITAS_TOTAL | number | Total de visitas aos anúncios |
| TAXA_CONVERSAO | number | Visitas → Pedidos (%) |
| DATA_SINCRONIZACAO | ISO 8601 | Quando foi atualizado |

**Estrutura:** 1 linha = snapshot atual (sempre sobrescrever)

---

## Regras de Negócio

1. **Sincronização automática e manual:**
   - Manual: Botão "Sincronizar Anúncios" dispara sync imediatamente
   - Automático: Trigger diário (6:00 UTC) via ScriptApp
   - TTL Cache: 30 minutos (dados de anúncio mudam frequentemente)

2. **Upsert em ANUNCIOS_SHOPEE:**
   - Se item_id já existe: atualizar linha
   - Se item_id novo: inserir linha
   - Nunca deletar linhas — apenas marcar STATUS="deletado"

3. **Históricos append-only:**
   - ANUNCIOS_HISTORICO_PRECOS: nova linha cada vez que preço muda
   - ANUNCIOS_HISTORICO_ESTOQUE: nova linha cada mudança de estoque
   - Núnca sobrescrever — crescem indefinidamente (auditoria)

4. **Status imutáveis em Sheets:**
   - "ativo": anúncio publicado, recebendo pedidos
   - "pausado": publicado mas não aparece em busca (pausado pelo vendedor)
   - "deletado": removido da Shopee (não pode ser reativado)

5. **Limite de requisições TIOPS:**
   - Máximo 100 items por chamada `list_items`
   - Se > 100 anúncios: usar paginação (offset)
   - Batch update: máximo 100 items por requisição

6. **Preço e Estoque:**
   - Sempre sincronizar via TIOPS (nunca usar valor local sem confirmar)
   - Após atualizar preço/estoque → chamar `shopee_get_item` para confirmar (releitura obrigatória per skill tiops-contract)
   - PRECO e ESTOQUE nunca negativos

7. **Variações:**
   - Campo TIPO_VARIACAO: "sem_variacao", "1_nivel" (tamanho OU cor), "2_niveis" (tamanho E cor)
   - Se houver variações: armazenar dados completos em DADOS_JSON (não desagregar em Sheets — v1)
   - Updatee preço/estoque por variação via endpoint específico (model_id)

8. **Outlet Shop:**
   - Se item está publicado em outlet shop: ATIVO_OUTLET=true
   - Outlet usa mapping interno (mart_item_id → outlet_item_id)
   - Mesmos itens podem ter preço/estoque diferentes em outlet vs principal

9. **Invalidação de cache:**
   - Após sync automático ou manual, invalidar CacheService
   - Dashboard sempre mostra dados sincronizados

10. **Integração com Precificação:**
    - PricingService.calculateSuggestedPrice() pode consultar ANUNCIOS_SHOPEE para preço atual
    - Mas NÃO atualiza diretamente — gera sugestão apenas

---

## Casos de Borda

- **Item sem estoque:** STATUS permanece "ativo", ESTOQUE=0 (item pausado automaticamente por Shopee)
- **Item deletado na Shopee:** STATUS="deletado", histórico preservado em Sheets
- **Variações com preços diferentes:** Armazenar tudo em DADOS_JSON, não criar linhas separadas
- **Categoria vazia:** Aceitar (item pode estar em categoria padrão)
- **Primeira sincronização:** Criar todas as abas automaticamente
- **Atualização de preço falha:** Logar erro, não atualizar Sheets (não inconsistência)
- **Item criado manual via Shopee app:** Próxima sync detecta e insere em ANUNCIOS_SHOPEE
- **Imagem indisponível:** Armazenar URL vazia, não falhar
- **Avaliação com 0 comentários:** Aceitar (novo item ou sem feedback)

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Sincronização bem-sucedida
```
Given: Loja tem 10 anúncios ativos na Shopee
When: Clica botão "Sincronizar Anúncios"
Then:
  - ANUNCIOS_SHOPEE tem 10 linhas com todos os campos preenchidos
  - STATUS de todos = "ativo"
  - PRECO, ESTOQUE, AVALIACAO, VENDAS_30D com valores corretos
  - Toast: "Sincronizados 10 anúncios • Estoque total: 125"
```

### Scenario 2: Atualização de item existente
```
Given: Item "Maison Delilah" já em ANUNCIOS_SHOPEE com PRECO=99.90
When: Shopee retorna PRECO=89.90 após atualização externa
Then:
  - Linha do item atualizada: PRECO=89.90
  - Nova linha em ANUNCIOS_HISTORICO_PRECOS: 99.90 → 89.90
  - DATA_ATUALIZACAO do item reflete timestamp da sync
```

### Scenario 3: Pausar anúncio
```
Given: Item "Maison Delilah" com STATUS="ativo"
When: Usuário clica "Pausar" na UI
Then:
  - Chama anunciosShopee.pauseItem(itemId)
  - TIOPS pausa o item em Shopee
  - Releitura confirma novo status
  - ANUNCIOS_SHOPEE atualiza: STATUS="pausado"
  - Histórico preserva prévio "ativo"
```

### Scenario 4: Histórico de estoque
```
Given: Item com ESTOQUE=20
When: Venda ocorre, estoque vai para 19
  E sync detecta mudança
Then:
  - ANUNCIOS_SHOPEE: ESTOQUE=19
  - ANUNCIOS_HISTORICO_ESTOQUE: nova linha
    ESTOQUE_ANTIGO=20, ESTOQUE_NOVO=19, MUDANCA=-1, MOTIVO="Venda"
```

### Scenario 5: Performance agregada
```
Given: 10 anúncios sincronizados com: 500 vendas, 125 estoque, 4.8 avaliação média
When: Sync completa
Then:
  - ANUNCIOS_PERFORMANCE (linha única) atualiza:
    TOTAL_ANUNCIOS_ATIVOS=10
    TOTAL_ESTOQUE=125
    VENDAS_TOTAL=500
    AVALIACAO_MEDIA=4.8
```

### Scenario 6: Cache funciona (30 min TTL)
```
Given: Acabou de sincronizar
When: Recarrega página e abre anúncios novamente (< 30 min depois)
Then:
  - Dados carregam instantaneamente (< 1s)
  - Não chama TIOPS
  - Toast: "Usando dados em cache (atualizado há 5 min)"
```

---

## Fora de Escopo (v1)

- Criar novos anúncios via interface (apenas leitura + edição básica de preço/estoque)
- Edição de título, descrição, imagens, variações
- Sincronização bidirecional (editar Sheets e atualizar Shopee)
- Promoções/descontos (leitura apenas)
- Video uploads/management
- Recomendações de preço baseadas em concorrência
- Alertas automáticos (estoque baixo, avaliação caindo)
- Relatórios avançados (análise de sazonalidade, etc)

---

## Dependências

### Services
- `TiopsClient` — chamar ações shopee_*
- `ConfigService` — shopId, sheet ID, timezone
- `FormatterService` — formatar datas, valores, percentuais

### Repositories
- `AnunciosShopeeRepository` (novo) — ler/escrever abas ANUNCIOS_*

### Google Apps Script
- `SpreadsheetApp` — acesso às 4 abas
- `CacheService` — cache com TTL 30min
- `ScriptApp` — trigger diário

### Ações TIOPS (24 principais de 75+)

**Leitura:**
- `shopee_list_items` — listar todos os anúncios ✅ confirmada
- `shopee_get_item` — detalhes de um item (releitura obrigatória pós-update) ✅ confirmada
- `shopee_get_items_batch` — detalhes em lote ✅ confirmada
- `shopee_get_models` — variações/SKUs ✅ confirmada
- `shopee_sales_by_item` — vendas por item ✅ confirmada
- ~~`shopee_sales_summary`~~ — **NÃO EXISTE no catálogo** (verificado 2026-08-05); usar `shopee_sales_by_item` por item
- ~~`shopee_get_item_pictures`~~ — **NÃO EXISTE no catálogo** (verificado 2026-08-05); imagens vêm em `shopee_get_item.image.image_url_list`

**Criação/Edição:**
- `shopee_create_item` — criar novo anúncio ✅ confirmada
- `shopee_update_item` — editar anúncio (título, descrição, etc) ✅ confirmada
- `shopee_update_price` — atualizar preço ✅ confirmada
- `shopee_update_stock` — atualizar estoque ✅ confirmada
- `shopee_add_model` — adicionar variação ✅ confirmada
- `shopee_update_model` — editar variação ✅ confirmada
- `shopee_upload_image` — upload de imagem ✅ confirmada

**Status:**
- ~~`shopee_pause_item`~~ — **NÃO EXISTE no catálogo** (verificado 2026-08-05)
- ~~`shopee_activate_item`~~ — **NÃO EXISTE no catálogo** (verificado 2026-08-05)
- `shopee_delete_item` — deletar anúncio ✅ confirmada
- `shopee_unlist_item` — deslistar (única forma de pausar) ✅ confirmada
- `shopee_boost_item` — impulsionar anúncio ✅ confirmada

**Métricas:**
- `shopee_get_item_promotion` — promoções ativas
- `shopee_get_attribute_tree` — metadados de atributos
- `shopee_get_categories` — lista de categorias

Parâmetro obrigatório: `shopId`

---

## Notas de Implementação

### Estrutura de arquivos
```
src/03_services/anunciosShopee/
├── AnunciosShopeeService.js       # Orquestração
└── AnunciosShopeeRepository.js    # I/O Sheets

ui/anunciosShopee/
└── AnunciosShopeeView.html        # Dashboard / table view
```

### Inicialização de abas
```javascript
function initializeSheets() {
  var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
  
  // Aba 1: ANUNCIOS_SHOPEE
  if (!ss.getSheetByName('ANUNCIOS_SHOPEE')) {
    var sheet = ss.insertSheet('ANUNCIOS_SHOPEE');
    sheet.appendRow([
      'ITEM_ID', 'NOME', 'CATEGORIA', 'PRECO', 'ESTOQUE', 'STATUS',
      'DATA_CRIACAO', 'DATA_ATUALIZACAO', 'IMAGEM_URL', 'LINK_SHOPEE',
      'VENDAS_30D', 'AVALIACAO', 'NUM_COMENTARIOS', 'TIPO_VARIACAO',
      'ORIGINAL_PRICE', 'MOEDA', 'ATIVO_OUTLET', 'DADOS_JSON', 'DATA_SINCRONIZACAO'
    ]);
  }
  
  // Aba 2: ANUNCIOS_HISTORICO_PRECOS
  if (!ss.getSheetByName('ANUNCIOS_HISTORICO_PRECOS')) {
    var sheet = ss.insertSheet('ANUNCIOS_HISTORICO_PRECOS');
    sheet.appendRow([
      'ITEM_ID', 'NOME_ITEM', 'PRECO_ANTIGO', 'PRECO_NOVO', 'DATA_MUDANCA',
      'USUARIO', 'REFERENCIA'
    ]);
  }
  
  // Aba 3: ANUNCIOS_HISTORICO_ESTOQUE
  if (!ss.getSheetByName('ANUNCIOS_HISTORICO_ESTOQUE')) {
    var sheet = ss.insertSheet('ANUNCIOS_HISTORICO_ESTOQUE');
    sheet.appendRow([
      'ITEM_ID', 'NOME_ITEM', 'ESTOQUE_ANTIGO', 'ESTOQUE_NOVO', 'MUDANCA',
      'DATA_MUDANCA', 'MOTIVO', 'REFERENCIA'
    ]);
  }
  
  // Aba 4: ANUNCIOS_PERFORMANCE
  if (!ss.getSheetByName('ANUNCIOS_PERFORMANCE')) {
    var sheet = ss.insertSheet('ANUNCIOS_PERFORMANCE');
    sheet.appendRow([
      'PERIODO', 'TOTAL_ANUNCIOS_ATIVOS', 'TOTAL_ESTOQUE', 'VENDAS_TOTAL',
      'PEDIDOS_TOTAL', 'AVALIACAO_MEDIA', 'COMENTARIOS_TOTAL', 'VISITAS_TOTAL',
      'TAXA_CONVERSAO', 'DATA_SINCRONIZACAO'
    ]);
  }
}
```

### Cache Strategy
```javascript
function getListingsCache(forceFresh) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'shopee_listings_snapshot';
  
  if (!forceFresh) {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }
  
  // Fresh sync
  var data = syncListings({forceFresh: true});
  cache.put(cacheKey, JSON.stringify(data), 1800); // TTL 30min
  return data;
}
```

### Releitura obrigatória pós-update
```javascript
function updateItemPrice(itemId, newPrice) {
  // 1. Chamar update
  var updateResult = TiopsClient.call('shopee_update_price', {
    shopId: ConfigService.getShopId(),
    itemId: itemId,
    priceList: [{itemId: itemId, price: newPrice}]
  });
  
  if (!updateResult.success) throw new Error('Update failed');
  
  // 2. RELEITURA obrigatória
  var confirmResult = TiopsClient.call('shopee_get_item', {
    shopId: ConfigService.getShopId(),
    itemId: itemId
  });
  
  // 3. Confirmar que mudou
  if (confirmResult.item.price !== newPrice) {
    throw new Error('Confirmação falhou: preço não foi atualizado');
  }
  
  return confirmResult.item;
}
```

### Trigger automático diário
```javascript
function setupDailyListingsSync() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncListingsDaily') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 06:00 UTC (ou 03:00 BRT)
  ScriptApp.newTrigger('syncListingsDaily')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
}

function syncListingsDaily() {
  AnunciosShopeeService.syncListings({forceFresh: true});
  Logger.log('Anúncios sincronizados diariamente');
}
```

---

## Teste de Aceitação

No browser:
- Página "Anúncios Shopee" carrega ✅
- Botão "Sincronizar" existe ✅
- Tabela mostra: ID, Nome, Preço, Estoque, Status, Vendas, Avaliação ✅
- Click item → mostra detalhes completos ✅
- Botão "Pausar" / "Ativar" funciona ✅
- Editar preço inline → atualiza Shopee via TIOPS + releitura confirma ✅
- Editar estoque inline → atualiza Shopee + histórico registra ✅
- Toast com resultado: "Sincronizados 15 • Estoque total: 125" ✅
- Abas Sheets criadas automaticamente ✅
- Dados persistem após reload (cache valida) ✅
- Históricos (preços, estoque) acumulam sem perder dados ✅
- Performance mostra agregados corretos ✅
- Após 30min de cache: next sync chama TIOPS novamente ✅
- Erro TIOPS → mostra cache antigo + alerta ✅
