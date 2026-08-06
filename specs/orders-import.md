# Spec: Importação de Pedidos Shopee para Google Sheets

## Status
Approved

## Objetivo
Importar pedidos da Shopee via MCP Tiops e armazená-los em Google Sheets (aba PEDIDOS) de forma estruturada e sem duplicatas. Disparado manualmente por botão no GAS. Fornece origem única de dados de pedidos para análise offline e reconciliação com a plataforma oficial.

## Contrato da API Interna

### `ordersImport.importShopeeOrders`
- **Descrição:** Busca pedidos Shopee via Tiops, verifica duplicatas por order_id, insere novos em Sheets.
- **Params:**
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |------|------|-------------|---------|-----------|
  | `limit` | number | Não | 100 | Quantos pedidos buscar da Shopee (máximo por chamada) |
  | `offset` | number | Não | 0 | Paginação — offset da última busca (para chamar multiplas vezes) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    imported: number,        // Quantos pedidos novos foram inseridos
    duplicates: number,      // Quantos já existiam (detectados por order_id)
    errors: [                // Erros não-fatais durante processamento
      { orderId: string, reason: string }
    ],
    message: string          // Resumo amigável: "Importados 5, 3 duplicatas"
  }
  ```

- **Erros esperados:**
  - `TIOPS_API_KEY_MISSING`: Variável `TIOPS_API_KEY` não configurada em Script Properties.
  - `TIOPS_CALL_FAILED`: Tiops retornou erro (ex: credenciais inválidas, rate limit).
  - `SHEETS_WRITE_FAILED`: Falha ao escrever em Google Sheets (permissões, limite de células).

## Regras de Negócio

1. **Deduplicação por order_id:**
   - Cada pedido Shopee tem um `order_id` único
   - Antes de inserir, verificar se `order_id` já existe na aba PEDIDOS (via OrdersRepository)
   - Se EXISTS → contar como duplicata, não inserir
   - Se NOT EXISTS → inserir linha nova com todos os campos que Shopee retornar

2. **Schema da aba PEDIDOS:**
   - Usar **exatamente** a estrutura que Shopee retorna via Tiops (sem renomear/transformar colunas)
   - Primeira linha: cabeçalho (nomes das colunas da resposta Tiops)
   - Linhas subsequentes: um pedido por linha

3. **Campos esperados de Shopee** (exemplo do que pode vir):
   - `order_id`, `order_sn`, `create_time`, `update_time`, `status`, `total_amount`, `buyer_username`, `buyer_id`, `shipping_carrier`, `tracking_number`, etc.
   - Alguns campos podem ser opcionais — não falhar se faltarem

4. **Frequency e limites:**
   - Importação manual (botão, não automática)
   - Máximo 100 pedidos por chamada Tiops (default)
   - Se usuário tiver > 100, chamar múltiplas vezes (paginação via `offset`)

5. **Aba PEDIDOS:**
   - Deve existir no Google Sheets (criar se não existir no primeiro import)
   - Estrutura: `[{ col1, col2, ... }, ...]` (array de objetos chave-valor)
   - Sem limites de linha (append sempre)

## Casos de Borda

- **Pedido inserido, mas falha ao gravar em Sheets:** Contar como erro não-fatal, não re-inserir, continuar com próximos.
- **Tiops retorna lista vazia:** Retornar `{imported: 0, duplicates: 0, errors: [], message: "Nenhum pedido novo"}`.
- **Tiops cai/falha:** Lançar erro fatalmente (não tentar retry dentro do serviço — deixar para UI/caller).
- **Mesma função chamada 2 vezes seguidas:** Segunda chamada retorna `imported: 0, duplicates: N` (toda primeira batch já foi inserida).
- **Mudança de status de um pedido já importado:** Ignorar (v1 não atualiza, apenas insere novos).

### `ordersImport.syncOrderBySn`
- **Descrição:** Sincroniza um único pedido pelo `order_sn`: busca detail +
  escrow na Tiops, normaliza e faz upsert na planilha. Se o pedido já
  existe, atualiza **todas** as colunas da linha (não só o STATUS). Usado
  pelo `PushNotificationService` nos webhooks Shopee.
- **Params:**
  | Nome | Tipo | Obrigatório | Descrição |
  |------|------|-------------|-----------|
  | `orderSn` | string | Sim | order_sn do pedido Shopee |
- **Retorno:**
  ```javascript
  {
    success: boolean,
    orderSn: string,
    status: string,      // status salvo na planilha
    inserted: number,    // 1 se linha nova
    updated: number      // 1 se linha existente atualizada
  }
  ```
- **Erros esperados:** `orderSn obrigatório`, `detail error`, `detail not
  found`, `normalize failed`.

## Critérios de Aceite (Given/When/Then)

1. **Caso: Primeiro import com pedidos novos**
   - Given usuário clica "Sincronizar Pedidos Shopee" 
   - When Tiops retorna 3 pedidos válidos 
   - Then `{imported: 3, duplicates: 0}` é retornado E 3 linhas aparecem em Sheets

2. **Caso: Segunda chamada (duplicatas)**
   - Given 3 pedidos já estão em Sheets (mesmos order_ids)
   - When importação é acionada novamente 
   - Then `{imported: 0, duplicates: 3}` é retornado E Sheets não muda

3. **Caso: Mix de novo e duplicado**
   - Given 2 pedidos já em Sheets
   - When 5 pedidos retornam de Tiops (2 antigos + 3 novos)
   - Then `{imported: 3, duplicates: 2}` E 3 linhas novos aparecem em Sheets

4. **Caso: Tiops falha**
   - Given `TIOPS_API_KEY` inválida ou Tiops offline
   - When importação é acionada
   - Then erro fatalmente com mensagem clara ("Tiops indisponível" ou "Credencial inválida")

5. **Caso: Sheets indisponível**
   - Given Google Sheets está inacessível ou quota atingida
   - When alguns pedidos já foram parseados de Tiops e falta escrever
   - Then retornar com parciais: `{imported: 2, duplicates: 1, errors: [{orderId: '123', reason: 'Sheets write failed'}]}`

## Amendment: Captura de Itens por Pedido (ITEMS_JSON)

**Status do amendment: Draft.** Complementar ao contrato acima — não altera
`importShopeeOrders`/`syncOrderBySn` como ações, só estende o que `normalizeOrder_()`
grava por pedido. Motivado pela Fase 9 do plano do projeto (motor de controle de
estoque automatizado): hoje `normalizeOrder_()` recebe `detail.item_list` (array de
itens do pedido) mas descarta toda a granularidade ao formatar `ITEMS_DETAIL` como
string livre (`"nome (SKU:x qty R$price)"` — o rótulo "SKU:" nessa string é
enganoso, é só quantidade/preço concatenado, nunca um identificador real). Sem o
`item_id` de cada item, não existe nenhuma chave entre um pedido Shopee e o produto
correspondente no estoque — ver `specs/estoque-baixa-shopee.md` para o consumo
desse dado.

### Campo novo em PEDIDOS

| Campo | Formato | Descrição |
|-------|---------|-----------|
| `ITEMS_JSON` | string (JSON) | Backup do array bruto `detail.item_list`, um objeto por item: `{item_id, model_id, item_name, item_sku, model_quantity_purchased, model_discounted_price}`. Mesmo padrão que `ANUNCIOS_SHOPEE.DADOS_JSON` já usa para backup de payload bruto. |

`ITEMS_DETAIL` (string legada) e `ITEM_COUNT` continuam existindo sem alteração —
nada que já lê essas colunas quebra.

### ⚠️ Premissa não confirmada — precisa de validação antes de codar

**Este amendment assume que `shopee_get_order_detail.item_list[]` traz `item_id` e
`model_id` por item**, seguindo o schema padrão documentado publicamente pela Shopee
Open API (`order.get_order_detail`, campo `item_list[].item_id`/`model_id`). Essa
suposição **não foi confirmada contra o catálogo real da Tiops neste projeto** — a
sessão que escreveu este amendment estava com a conexão MCP à Tiops indisponível
(API key inválida/revogada) no momento da escrita.

**Antes de implementar esta parte da spec, é obrigatório (skill `tiops-contract`):**
1. Rodar `describe_action` (ou chamar `shopee_get_order_detail` com um `order_sn`
   real e inspecionar a resposta bruta) e confirmar se `item_list[]` de fato traz
   `item_id`/`model_id`.
2. **Se confirmado:** implementar como descrito acima.
3. **Se NÃO confirmado (campo ausente ou com outro nome):** **parar e reportar** —
   não adivinhar nome de campo nem inventar chamada complementar. Documente aqui o
   nome real encontrado e atualize este amendment antes de prosseguir para
   `specs/estoque-baixa-shopee.md` (Fase 4), que depende deste dado. Se realmente
   não houver `item_id` disponível em nenhuma chamada de detalhe de pedido, a Fase 4
   precisa ser redesenhada (ex. correlação por `item_name` normalizado, chave mais
   frágil, fora do desenho atual) — não prosseguir sem essa decisão explícita.

### Critério de Aceite adicional

- Given um pedido real com 2+ itens diferentes
- When `syncOrderBySn`/`importShopeeOrders` processa esse pedido
- Then `PEDIDOS.ITEMS_JSON` contém um array com uma entrada por item, cada uma com
  `item_id` e `model_id` preenchidos (não vazios/undefined) — se vier vazio, é sinal
  de que a premissa acima falhou e a spec precisa ser revisada antes de prosseguir.

### Dependências adicionais

- Ação Tiops: `shopee_get_order_detail` (já em uso) — schema de `item_list[]` a
  confirmar via `describe_action` antes da implementação, conforme acima.

## Fora de Escopo (v1)

- Atualização de pedidos já importados (status, valores).
- Sincronização automática (apenas manual via botão).
- Sincronização de pedidos Mercado Livre (apenas Shopee v1).
- Rollback de imports falhados.
- Histórico de versões de um pedido.
- Integração com outras abas (não duplicar dados entre PEDIDOS e outras fontes).

## Dependências

- **Services/Adapters:**
  - `TiopsClient.call(action, params)` — chamar Tiops API
  - `OrdersRepository.getByOrderId(orderId)` — verificar se order_id já existe
  - `OrdersRepository.insertOrder(order)` — inserir nova linha em PEDIDOS

- **Ações Tiops (nome exato):**
  - `shopee_list_orders` — buscar lista de pedidos Shopee
    - Params esperados: `{ shopId?, limit?, offset? }`
    - Retorna: `{ orders: [{ order_id, order_sn, status, total_amount, ... }] }`

- **Google Sheets:**
  - Planilha ID: `1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50` (em ConfigService.SHEET_ID)
  - Aba: `PEDIDOS` (criar se não existir)

## Notas de Implementação

1. **TiopsClient já existe** (`src/01_adapters/TiopsClient.js`) mas estava desativado — precisa reativar.
2. **OrdersRepository é nova** (`src/02_repositories/OrdersRepository.js`) — criar seguindo padrão de SheetsRepository.
3. **OrdersImportService é novo** (`src/03_services/ordersImport/OrdersImportService.js`) — principal orquestrador.
4. **Autenticação:** API key via `PropertiesService.getScriptProperties().getProperty('TIOPS_API_KEY')` (usuario configura manualmente no editor).
5. **Ordem de carregamento:** TiopsClient → OrdersRepository → OrdersImportService → ServiceRegistry (atualizar `filePushOrder` em appsscript.json).
6. **Registro no ServiceRegistry:** Usar padrão defensivo `safeRef_('ordersImport', function () { ... })`.
