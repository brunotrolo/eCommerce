# Referência Técnica Completa - Marketplace Connect API

## Endpoints

### Endpoint Principal
```
POST https://mcp.tiops.com.br
```

### MCP Server (Claude Desktop)
```
https://mcp.tiops.com.br/mcp?key=YOUR_KEY
```

## Autenticação

### Métodos Suportados

**Opção 1: Bearer Token**
```bash
Authorization: Bearer mc_live_XXXXXX
```

**Opção 2: API Key Header**
```bash
x-api-key: mc_live_XXXXXX
```

### Obtenção da Chave

1. Acesse https://marketplaces.tiops.com.br
2. Faça login com suas credenciais
3. Vá até a aba **"Agentes IA"**
4. Copie sua chave no formato `mc_live_XXXXXX`

## Formato de Requisição

```json
{
  "action": "action_name",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

### Exemplo Completo

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "shopee_sales_summary",
    "params": {
      "shopId": "shop_123456",
      "dateRange": "last_30_days"
    }
  }'
```

## Formato de Resposta

### Sucesso (Status 200)

```json
{
  "status": 200,
  "data": {
    "totalSales": 15000.00,
    "orderCount": 125,
    "averageOrderValue": 120.00
  }
}
```

### Erro

```json
{
  "error": "Descrição detalhada do erro"
}
```

ou

```json
{
  "status": 400,
  "error": "invalid_params"
}
```

## Ações de Discovery

### `list_actions`

Lista todas as 260+ ações disponíveis.

**Request:**
```json
{
  "action": "list_actions"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "total": 260,
    "actions": [
      {
        "name": "shopee_sales_summary",
        "description": "Obter resumo de vendas",
        "marketplace": "shopee"
      },
      {
        "name": "mercado_livre_list_items",
        "description": "Listar itens",
        "marketplace": "mercado_libre"
      }
    ]
  }
}
```

### `describe_action`

Retorna o schema completo e parâmetros de uma ação específica.

**Request:**
```json
{
  "action": "describe_action",
  "params": {
    "action_name": "shopee_sales_summary"
  }
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "name": "shopee_sales_summary",
    "description": "Obter resumo de vendas para uma loja Shopee",
    "marketplace": "shopee",
    "params": {
      "shopId": {
        "type": "string",
        "required": true,
        "description": "ID único da loja Shopee"
      },
      "dateRange": {
        "type": "string",
        "required": false,
        "enum": ["last_7_days", "last_30_days", "last_90_days"],
        "description": "Intervalo de datas"
      },
      "currency": {
        "type": "string",
        "required": false,
        "default": "BRL",
        "description": "Moeda do resultado"
      }
    }
  }
}
```

### `list_accounts`

Retorna todas as contas de marketplace conectadas.

**Request:**
```json
{
  "action": "list_accounts"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "accounts": [
      {
        "id": "acc_001",
        "name": "Loja Shopee Principal",
        "marketplace": "shopee",
        "param_to_use": "shopId",
        "value": "shop_123456",
        "email": "seller@example.com",
        "created_at": "2024-01-15T10:30:00Z",
        "tags": ["principal", "high-volume"]
      },
      {
        "id": "acc_002",
        "name": "Loja ML",
        "marketplace": "mercado_libre",
        "param_to_use": "meliUserId",
        "value": "123456789",
        "email": "seller@example.com",
        "created_at": "2024-02-01T14:20:00Z",
        "tags": ["active"]
      },
      {
        "id": "acc_003",
        "name": "ERP Bling",
        "marketplace": "bling",
        "param_to_use": "authUserId",
        "value": "user_bling_789",
        "created_at": "2024-03-10T08:15:00Z",
        "tags": ["erp"]
      }
    ],
    "total": 3
  }
}
```

## Marketplaces e Parâmetros

### Mercado Libre

**Parâmetro de Conta:** `meliUserId`

**Ações Disponíveis (~40):**
- `mercado_livre_list_items` - Listar itens
- `mercado_livre_get_item` - Obter detalhes do item
- `mercado_livre_list_orders` - Listar pedidos
- `mercado_livre_get_order` - Obter pedido
- `mercado_livre_update_item_status` - Atualizar status
- `mercado_livre_create_ad` - Criar anúncio
- `mercado_livre_list_ads` - Listar anúncios
- `mercado_livre_get_questions` - Obter perguntas
- `mercado_livre_answer_question` - Responder pergunta
- `mercado_livre_get_shipping` - Obter informações de envio

**Exemplo:**
```json
{
  "action": "mercado_livre_list_items",
  "params": {
    "meliUserId": "123456789",
    "status": "active",
    "offset": 0,
    "limit": 50
  }
}
```

### Shopee

**Parâmetro de Conta:** `shopId`

**Ações Disponíveis (~70):**
- `shopee_sales_summary` - Resumo de vendas
- `shopee_list_products` - Listar produtos
- `shopee_get_product` - Obter produto
- `shopee_update_product` - Atualizar produto
- `shopee_update_stock` - Atualizar estoque
- `shopee_list_orders` - Listar pedidos
- `shopee_get_order` - Obter pedido
- `shopee_update_order_status` - Atualizar status
- `shopee_list_ads` - Listar campanhas
- `shopee_create_ad` - Criar campanha
- `shopee_get_messages` - Obter mensagens
- `shopee_send_message` - Enviar mensagem
- `shopee_list_returns` - Listar devoluções
- `shopee_get_finance_summary` - Resumo financeiro

**Exemplo:**
```json
{
  "action": "shopee_sales_summary",
  "params": {
    "shopId": "shop_123456",
    "dateRange": "last_30_days",
    "currency": "BRL"
  }
}
```

### Shein

**Parâmetro de Conta:** `supplierId`

**Ações Disponíveis (~43):**
- `shein_list_products` - Listar produtos
- `shein_get_product` - Obter produto
- `shein_update_product` - Atualizar produto
- `shein_check_inventory` - Verificar inventário
- `shein_update_inventory` - Atualizar inventário
- `shein_list_orders` - Listar pedidos
- `shein_get_order` - Obter pedido
- `shein_update_order_status` - Atualizar status
- `shein_get_finance_summary` - Resumo financeiro
- `shein_check_compliance` - Verificar conformidade

**Exemplo:**
```json
{
  "action": "shein_check_inventory",
  "params": {
    "supplierId": "supplier_123456",
    "productIds": ["prod_001", "prod_002", "prod_003"]
  }
}
```

### Bling ERP

**Parâmetro de Conta:** `authUserId` ou `accountId`

**Ações Disponíveis (~60+):**
- `bling_list_products` - Listar produtos
- `bling_get_product` - Obter produto
- `bling_create_product` - Criar produto
- `bling_update_product` - Atualizar produto
- `bling_list_orders` - Listar pedidos
- `bling_get_order` - Obter pedido
- `bling_create_invoice` - Criar nota fiscal
- `bling_list_invoices` - Listar notas fiscais
- `bling_get_stock` - Obter estoque
- `bling_update_stock` - Atualizar estoque
- `bling_list_contacts` - Listar contatos
- `bling_create_contact` - Criar contato

**Exemplo:**
```json
{
  "action": "bling_list_orders",
  "params": {
    "authUserId": "user_bling_789",
    "status": "pending",
    "offset": 0,
    "limit": 50
  }
}
```

### Olist

**Parâmetro de Conta:** Incluído automaticamente nos parâmetros

**Ações Disponíveis (~178):**
- `olist_list_orders` - Listar pedidos
- `olist_get_order` - Obter pedido
- `olist_get_order_items` - Obter itens do pedido
- `olist_list_products` - Listar produtos
- `olist_get_product` - Obter produto
- `olist_create_product` - Criar produto
- `olist_update_product` - Atualizar produto
- `olist_list_shipping` - Listar envios
- `olist_get_shipping` - Obter envio
- `olist_list_contacts` - Listar contatos

**Exemplo:**
```json
{
  "action": "olist_list_orders",
  "params": {
    "sellerId": "seller_123456",
    "status": "processing",
    "offset": 0,
    "limit": 50
  }
}
```

### Shopee Affiliates

**Ações Disponíveis (~5):**
- `shopee_affiliate_search_products` - Buscar produtos
- `shopee_affiliate_generate_link` - Gerar link de afiliado
- `shopee_affiliate_get_commission` - Obter comissões

**Exemplo:**
```json
{
  "action": "shopee_affiliate_search_products",
  "params": {
    "query": "laptop",
    "category": "electronics",
    "limit": 20
  }
}
```

## Paginação

### Método 1: Offset/Limit

```json
{
  "action": "list_products",
  "params": {
    "shopId": "shop_123456",
    "offset": 0,
    "limit": 50
  }
}
```

Exemplo para obter próxima página:
```json
{
  "action": "list_products",
  "params": {
    "shopId": "shop_123456",
    "offset": 50,
    "limit": 50
  }
}
```

### Método 2: Page/PageSize

```json
{
  "action": "list_orders",
  "params": {
    "supplierId": "supplier_123456",
    "pageNum": 1,
    "pageSize": 100
  }
}
```

Próxima página:
```json
{
  "action": "list_orders",
  "params": {
    "supplierId": "supplier_123456",
    "pageNum": 2,
    "pageSize": 100
  }
}
```

## Filtros Comuns

### Por Status

```json
{
  "status": "active" | "inactive" | "pending" | "processing" | "shipped" | "delivered"
}
```

### Por Data

```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "dateRange": "last_7_days" | "last_30_days" | "last_90_days" | "last_year"
}
```

### Por Categoria

```json
{
  "category": "electronics",
  "subcategory": "computers"
}
```

## Limites e Rate Limits

- **Timeout padrão**: 30 segundos
- **Rate limit**: Variam por conta (consultar dashboard)
- **Máximo de itens por requisição**: Geralmente 500
- **Tamanho máximo de payload**: 10 MB

## Codes de Erro

| Código | Significado | Ação |
|--------|-------------|------|
| `invalid_api_key` | Chave API inválida | Verificar chave no dashboard |
| `unauthorized` | Sem autorização | Verificar permissões |
| `account_not_connected` | Conta não conectada | Conectar no dashboard |
| `action_not_found` | Ação não existe | Usar `list_actions` |
| `missing_required_param` | Parâmetro obrigatório faltando | Verificar schema com `describe_action` |
| `invalid_param_value` | Valor de parâmetro inválido | Verificar tipos esperados |
| `rate_limit_exceeded` | Limite de requisições atingido | Implementar backoff |
| `marketplace_error` | Erro do marketplace | Verificar status do marketplace |
| `timeout` | Requisição expirou | Tentar novamente |
| `internal_error` | Erro interno | Contactar suporte |

## Convenções de Nomenclatura

- **Action names**: `{marketplace}_{operation}` (ex: `shopee_list_products`)
- **Parâmetros**: snake_case (ex: `shop_id`, `product_id`)
- **Datas**: ISO 8601 (ex: `2024-01-15T10:30:00Z`)
- **IDs**: Alfanuméricos com prefixo (ex: `shop_123456`)

## Headers Recomendados

```bash
# Obrigatório
Content-Type: application/json
x-api-key: mc_live_XXXXXX

# Opcionais mas recomendados
User-Agent: MyApp/1.0
Accept: application/json
Accept-Encoding: gzip, deflate

# Para rastreamento
X-Request-ID: unique-request-id-123
X-Correlation-ID: correlation-id-456
```

## Timeouts Recomendados

| Tipo de Operação | Timeout |
|------------------|---------|
| Leitura simples (get) | 10s |
| Listagem (list) | 20s |
| Escrita (create/update) | 30s |
| Operações em bulk | 60s |

---

**Versão**: 2.0  
**Última atualização**: 10 de julho de 2026  
**Documentação oficial**: https://marketplaces.tiops.com.br/docs/api.html
