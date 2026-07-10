# MCP Tiops - Guia Rápido de Referência

> **Para um novo chat:** Este arquivo contém TUDO que você precisa saber para usar MCP Tiops na Shopee e Mercado Livre. Comece aqui!

## O Que É MCP Tiops?

MCP Tiops é uma ferramenta que permite interagir com **488 ações** de múltiplos marketplaces (Shopee, Mercado Livre, Olist, Shein, Bling) via uma única interface.

**Diferença:**
- ❌ Sem MCP: Entrar no site, navegar, clicar, esperar
- ✅ Com MCP: Uma linha de código, resultado em tempo real

## Suas Contas Conectadas

```
Mercado Livre: meliUserId = 3520412809 (ATIVA)
Shopee: shopId = 1880105398 (COM ADS)
Olist: Aguardando autorização
```

## Como Usar - Estrutura Básica

```javascript
// Sintaxe universal
mcp__Tiops__marketplace_action({
  action: "nome_da_acao",
  params: {
    itemId: "...",
    price: 199,
    // ... outros parâmetros
  }
})
```

## Ações Mais Usadas

### 📋 Listar & Buscar

| Ação | Parâmetros | Resultado |
|------|-----------|-----------|
| `list_items` | `meliUserId` ou `shopId` | Lista todos os anúncios |
| `get_item` | `itemId` | Detalhes completos de 1 produto |
| `search` | `query` | Buscar produtos |
| `list_accounts` | - | Suas contas conectadas |

**Exemplo:**
```javascript
// Listar anúncios do Mercado Livre
action: "list_items"
params: { meliUserId: "3520412809", limit: 10 }

// Listar anúncios da Shopee
action: "shopee_list_items"
params: { shopId: "1880105398", limit: 10 }
```

### 💰 Gerenciar Preços & Estoque

| Ação | O Que Faz |
|------|-----------|
| `update_item` | Mudar preço, título, descrição |
| `shopee_update_price` | Atualizar preço na Shopee |
| `shopee_update_stock` | Atualizar estoque na Shopee |

**Exemplo - Atualizar Preço:**
```javascript
action: "update_item"
params: {
  itemId: "MLB4872143941",
  price: 250
}
```

### 📦 Pedidos & Envios

| Ação | Para |
|------|------|
| `list_orders` | Listar pedidos |
| `get_order` | Detalhes de 1 pedido |
| `shopee_ship_order` | Enviar pedido Shopee |
| `get_shipment` | Rastrear envio |

### 📊 Campanhas & Ads

| Ação | Para |
|------|------|
| `ml_ads_create_campaign` | Criar campanha ML |
| `shopee_ads_campaigns` | Listar campanhas Shopee |
| `shopee_ads_create_campaign` | Criar campanha Shopee |

## Dicas Importantes ⚡

### 1. Formato de IDs
- **Mercado Livre:** Use `meliUserId` (não `ml_user_id`)
- **Shopee:** Use `shopId` (não `shop_id`)
- **Item IDs:** Começam com prefixo (MLB=Mercado Livre, etc)

### 2. Ações Por Marketplace
- **Mercado Livre:** `list_items`, `update_item`, `get_item`
- **Shopee:** `shopee_list_items`, `shopee_update_price`, `shopee_update_stock`
- **Ambos:** `list_orders`, `get_order`, `list_accounts`

### 3. Limite De Ações
✅ Você tem **ações ilimitadas** neste plano
```
"Plano ativo — ações ilimitadas."
```

### 4. Erros Comuns

❌ `ml_list_items` → ✅ `list_items`
❌ `action: "update_item", params: { meliUserId: ... }` → ✅ `update_item` sozinho

## Fluxo de Trabalho Típico

### 1️⃣ Ver Contas Conectadas
```javascript
action: "list_accounts"
```
Resposta: Todos os IDs que você precisa

### 2️⃣ Listar Anúncios
```javascript
action: "list_items"
params: { meliUserId: "3520412809", limit: 5 }
```

### 3️⃣ Pegar Detalhes de Um Produto
```javascript
action: "get_item"
params: { itemId: "MLB4872143941" }
```
Resposta: Preço, estoque, fotos, descrição, etc

### 4️⃣ Atualizar Preço
```javascript
action: "update_item"
params: { itemId: "MLB4872143941", price: 250 }
```

### 5️⃣ Listar Pedidos
```javascript
action: "list_orders"
params: { meliUserId: "3520412809" }
```

## Estrutura de Resposta

Sempre vem assim:
```javascript
{
  status: 200,           // ou 400 se erro
  data: {
    // Os dados que você pediu
  },
  mac_usage: {
    actions_used: 6,
    total_actions_available_now: 999999
  }
}
```

## Referência Completa de Ações

**Mercado Livre (ml_*):**
- Produtos: `list_items`, `get_item`, `create_item`, `update_item`, `pause_item`, `activate_item`
- Pedidos: `list_orders`, `get_order`, `ml_search_orders`
- Campanhas: `ml_ads_create_campaign`, `ml_ads_update_campaign`
- Coupons: `ml_create_coupon`, `ml_update_coupon`
- Promoções: `ml_create_seller_campaign`
- **Total: 90+ ações**

**Shopee (shopee_*):**
- Produtos: `shopee_list_items`, `shopee_get_item`, `shopee_create_item`, `shopee_update_item`
- Preço/Estoque: `shopee_update_price`, `shopee_update_stock`
- Pedidos: `shopee_list_orders`, `shopee_get_order`
- Envios: `shopee_ship_order`, `shopee_get_tracking_number`
- Ads: `shopee_ads_campaigns`, `shopee_ads_create_campaign`
- **Total: 143+ ações**

**Olist (olist_*):**
- **Total: 178+ ações**

**Shein (shein_*):**
- **Total: 43+ ações**

**Bling (bling_*):**
- **Total: Múltiplas ações**

## Exemplo Real: Atualizar Todos Os Preços

```javascript
// 1. Listar seus anúncios
const items = await mcp__Tiops__marketplace_action({
  action: "list_items",
  params: { meliUserId: "3520412809", limit: 100 }
})

// 2. Para cada item, atualizar preço
const updates = items.data.results.map(itemId => 
  mcp__Tiops__marketplace_action({
    action: "update_item",
    params: { 
      itemId: itemId,
      price: novoPreco  // seu novo preço
    }
  })
)
```

## Próximos Passos

1. **Experimentar:** Use o guia acima para testar ações
2. **Automatizar:** Criar scripts para atualizar preços, estoque, etc
3. **Integrar:** Conectar com seu sistema de gerenciamento
4. **Monitorar:** Acompanhar vendas e métricas em tempo real

## Suporte

Se receber erro:
- ✅ Consulte este guia
- ✅ A mensagem de erro geralmente diz o que falta
- ✅ Verifique o formato de parâmetros acima
- ✅ Tente com uma ação simples como `list_accounts`

---

**Última atualização:** 2026-07-10
**Status:** Ações ilimitadas ✅
**Contas:** Mercado Livre + Shopee ✅
