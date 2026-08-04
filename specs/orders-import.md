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
