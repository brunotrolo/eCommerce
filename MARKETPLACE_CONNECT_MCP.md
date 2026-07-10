# Guia de Integração Marketplace Connect API (MCP)

Documentação especializada para integrar sistemas com a **Marketplace Connect API**, um gateway unificado para gerenciar múltiplos marketplaces de e-commerce.

## O que é Marketplace Connect

A **Marketplace Connect API** fornece acesso a **260+ ações** de e-commerce unificadas através de uma única API para:

- **Mercado Livre** — itens, pedidos, anúncios, perguntas, envios, catálogo
- **Shopee** — produtos, pedidos, anúncios, chat, devoluções, finanças
- **Shein** — produtos, pedidos, inventário, finanças, envios, compliance (43+ ações)
- **Bling ERP** — produtos, pedidos, estoque, contatos, notas fiscais (60+ ações)
- **Olist** — pedidos, produtos, envios, contatos (178+ ações)
- **Shopee Affiliates** — buscar produtos, gerar links

## Conceitos Fundamentais

### Autenticação

A API utiliza chaves API no formato `mc_live_XXXXXX` obtidas no dashboard da plataforma:

```bash
# Header 1: Bearer Token
Authorization: Bearer mc_live_XXXXXX

# Header 2: API Key (alternativo)
x-api-key: mc_live_XXXXXX
```

**Obtenção da chave**: Acesse https://marketplaces.tiops.com.br, vá para a aba "Agentes IA" e copie sua chave.

### Formato de Requisição

Todas as chamadas utilizam o endpoint único `POST https://mcp.tiops.com.br`:

```json
{
  "action": "action_name",
  "params": {
    "marketplaceId": "value",
    "otherParam": "value"
  }
}
```

### Formato de Resposta

**Sucesso:**
```json
{
  "status": 200,
  "data": {
    "result": "content here"
  }
}
```

**Erro:**
```json
{
  "error": "Mensagem descritiva do erro"
}
```

## Descoberta de Ações (Discovery)

Antes de usar qualquer ação, utilize os comandos de descoberta para entender o que está disponível:

### 1. Listar Todas as Ações (260+)

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list_actions"
  }'
```

**Resposta:**
```json
{
  "status": 200,
  "data": {
    "total": 260,
    "actions": [
      {
        "name": "shopee_sales_summary",
        "description": "Obter resumo de vendas para uma loja",
        "marketplace": "shopee"
      },
      {
        "name": "mercado_livre_list_items",
        "description": "Listar itens do Mercado Livre",
        "marketplace": "mercado_libre"
      }
      // ... mais 258 ações
    ]
  }
}
```

### 2. Descrever uma Ação Específica

Para entender os parâmetros necessários de uma ação:

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "describe_action",
    "params": {
      "action_name": "shopee_sales_summary"
    }
  }'
```

**Resposta:**
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
        "description": "ID da loja Shopee"
      },
      "dateRange": {
        "type": "string",
        "required": false,
        "description": "Intervalo de datas (ex: last_30_days)"
      }
    }
  }
}
```

### 3. Listar Contas Conectadas

Cada conta de marketplace conectada tem um identificador único que deve ser usado em requisições:

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list_accounts"
  }'
```

**Resposta:**
```json
{
  "status": 200,
  "data": {
    "accounts": [
      {
        "id": "acc_123456",
        "name": "Minha Loja Shopee",
        "marketplace": "shopee",
        "param_to_use": "shopId",
        "value": "shop_123456"
      },
      {
        "id": "acc_789012",
        "name": "Loja ML",
        "marketplace": "mercado_libre",
        "param_to_use": "meliUserId",
        "value": "user_789012"
      }
    ],
    "total": 2
  }
}
```

**Mapas de Parâmetros por Marketplace:**

| Marketplace | Parâmetro Obrigatório | Valor Típico |
|-------------|----------------------|--------------|
| Mercado Libre | `meliUserId` | `123456789` |
| Shopee | `shopId` | `shop_123456` |
| Shein | `supplierId` | `supplier_123456` |
| Bling ERP | `authUserId` ou `accountId` | `user_123456` |
| Olist | Incluído nos parâmetros | `seller_123456` |

## Casos de Uso Comuns

### 1. Listar Todos os Itens Ativos do Mercado Livre

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "mercado_livre_list_items",
    "params": {
      "meliUserId": "123456789",
      "status": "active",
      "offset": 0,
      "limit": 50
    }
  }'
```

### 2. Obter Resumo de Vendas Shopee (Últimos 30 Dias)

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

### 3. Verificar Estoque Shein

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "shein_check_inventory",
    "params": {
      "supplierId": "supplier_123456",
      "productIds": ["prod_001", "prod_002"]
    }
  }'
```

### 4. Listar Pedidos Bling com Status Específico

```bash
curl -X POST https://mcp.tiops.com.br \
  -H "x-api-key: mc_live_XXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "bling_list_orders",
    "params": {
      "authUserId": "user_123456",
      "status": "pending",
      "offset": 0,
      "limit": 100
    }
  }'
```

### 5. Dashboard Multi-Marketplace

Combinar dados de múltiplos marketplaces:

```json
{
  "action": "get_cross_marketplace_sales",
  "params": {
    "marketplaces": ["mercado_libre", "shopee", "shein"],
    "dateRange": "last_30_days",
    "groupBy": "marketplace"
  }
}
```

## Integração por Plataforma

### Claude Desktop (MCP Server)

Adicionar ao arquivo `~/.claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "marketplace-connect": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"],
      "env": {
        "API_URL": "https://mcp.tiops.com.br",
        "API_KEY": "mc_live_YOUR_KEY"
      }
    }
  }
}
```

Ou usar o endpoint MCP direto:
```
https://mcp.tiops.com.br/mcp?key=YOUR_KEY
```

### Python

```python
import requests

class MarketplaceConnect:
    def __init__(self, api_key):
        self.url = "https://mcp.tiops.com.br"
        self.headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json"
        }
        self._actions_cache = {}

    def discover_actions(self):
        """Cache de todas as ações disponíveis (260+)"""
        response = requests.post(
            self.url,
            json={"action": "list_actions"},
            headers=self.headers
        )
        data = response.json()
        if data.get("status") == 200:
            self._actions_cache = {
                a["name"]: a for a in data["data"]["actions"]
            }
        return self._actions_cache

    def describe_action(self, action_name):
        """Obter parâmetros e schema de uma ação"""
        response = requests.post(
            self.url,
            json={
                "action": "describe_action",
                "params": {"action_name": action_name}
            },
            headers=self.headers
        )
        return response.json()["data"]

    def call_action(self, action, params=None):
        """Executar qualquer ação de marketplace"""
        response = requests.post(
            self.url,
            json={"action": action, "params": params or {}},
            headers=self.headers
        )
        return response.json()

    def list_accounts(self):
        """Obter contas conectadas com seus parâmetros"""
        return self.call_action("list_accounts")

    def get_account_by_marketplace(self, marketplace):
        """Obter conta específica por marketplace"""
        response = self.list_accounts()
        for account in response.get("data", {}).get("accounts", []):
            if account["marketplace"].lower() == marketplace.lower():
                return account
        return None


# Uso:
client = MarketplaceConnect("mc_live_YOUR_KEY")

# Descobrir ações
actions = client.discover_actions()
print(f"Total de ações disponíveis: {len(actions)}")

# Obter contas conectadas
accounts = client.list_accounts()
for acc in accounts["data"]["accounts"]:
    print(f"{acc['name']}: {acc['marketplace']}")

# Descrever ação
shopee_sales = client.describe_action("shopee_sales_summary")
print(f"Parâmetros: {shopee_sales['params'].keys()}")

# Executar ação
sales = client.call_action("shopee_sales_summary", {
    "shopId": "shop_123456",
    "dateRange": "last_30_days"
})
print(f"Vendas: {sales['data']}")
```

### Node.js / TypeScript

```typescript
interface ApiResponse<T = unknown> {
  status?: number;
  data?: T;
  error?: string;
}

class MarketplaceConnect {
  private url = "https://mcp.tiops.com.br";
  private headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    };
  }

  async call<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<ApiResponse<T>> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ action, params })
    });
    return response.json() as Promise<ApiResponse<T>>;
  }

  async listActions() {
    return this.call("list_actions");
  }

  async listAccounts() {
    return this.call("list_accounts");
  }

  async describeAction(actionName: string) {
    return this.call("describe_action", { action_name: actionName });
  }

  async getSalesMetrics(marketplace: string, shopId: string, days = 30) {
    const actionMap: Record<string, string> = {
      shopee: "shopee_sales_summary",
      mercado_libre: "mercado_livre_sales_summary",
      shein: "shein_sales_summary"
    };

    const action = actionMap[marketplace];
    if (!action) throw new Error(`Marketplace ${marketplace} não suportado`);

    return this.call(action, {
      [this.getIdParam(marketplace)]: shopId,
      dateRange: `last_${days}_days`
    });
  }

  private getIdParam(marketplace: string): string {
    const map: Record<string, string> = {
      mercado_libre: "meliUserId",
      shopee: "shopId",
      shein: "supplierId",
      bling: "authUserId",
      olist: "sellerId"
    };
    return map[marketplace] || `${marketplace}Id`;
  }
}

// Uso:
const client = new MarketplaceConnect("mc_live_YOUR_KEY");

// Listar ações
const actions = await client.listActions();
console.log(`Total de ações: ${actions.data?.total}`);

// Obter contas
const accounts = await client.listAccounts();
accounts.data?.accounts?.forEach(acc => {
  console.log(`${acc.name}: ${acc.marketplace}`);
});

// Obter vendas
const sales = await client.getSalesMetrics("shopee", "shop_123456", 30);
console.log(sales.data);
```

### cURL (Linha de Comando)

```bash
#!/bin/bash

API_KEY="mc_live_YOUR_KEY"
ENDPOINT="https://mcp.tiops.com.br"

# 1. Descobrir ações
echo "=== Listando todas as ações ==="
curl -s -X POST $ENDPOINT \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "list_actions"}' | jq '.data.total'

# 2. Listar contas
echo "=== Contas conectadas ==="
curl -s -X POST $ENDPOINT \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "list_accounts"}' | jq '.data.accounts[] | {name, marketplace, param_to_use}'

# 3. Executar ação
echo "=== Vendas Shopee (últimos 30 dias) ==="
curl -s -X POST $ENDPOINT \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "shopee_sales_summary",
    "params": {
      "shopId": "shop_123456",
      "dateRange": "last_30_days"
    }
  }' | jq '.data'
```

## Tratamento de Erros

### Erros Comuns

| Erro | Causa | Solução |
|------|-------|--------|
| `invalid_api_key` | Chave inválida ou expirada | Verificar chave no dashboard |
| `account_not_connected` | Marketplace não conectado | Conectar conta no dashboard |
| `rate_limit_exceeded` | Muitas requisições | Aguardar ou implementar backoff |
| `action_not_found` | Ação não existe | Usar `list_actions` para verificar |
| `missing_required_param` | Parâmetro obrigatório faltando | Usar `describe_action` para ver schema |

### Implementar Retry com Backoff

```python
import time
import requests
from typing import Optional, Dict, Any

def call_with_retry(
    api_key: str,
    action: str,
    params: Optional[Dict[str, Any]] = None,
    max_retries: int = 3
) -> Dict[str, Any]:
    """Chamada com retry automático e backoff exponencial"""
    url = "https://mcp.tiops.com.br"
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}

    for attempt in range(max_retries):
        try:
            response = requests.post(
                url,
                json={"action": action, "params": params or {}},
                headers=headers,
                timeout=30
            )
            result = response.json()

            if result.get("error"):
                # Retry apenas para erros temporários
                if "rate_limit" in result["error"] and attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # backoff exponencial: 1, 2, 4 segundos
                    print(f"Rate limit. Aguardando {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                raise Exception(result["error"])

            return result

        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"Timeout. Aguardando {wait_time}s...")
                time.sleep(wait_time)
                continue
            raise

    raise Exception("Máximo de tentativas excedido")
```

## Paginação

A maioria das ações que retornam listas suportam paginação:

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

Ou com numeração de página:

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

## Melhores Práticas

1. **Sempre fazer discovery primeiro** — Use `list_actions` e `describe_action` antes de integrar uma ação nova.

2. **Cache as contas conectadas** — Não faça `list_accounts` em cada requisição. Cache por 1 hora.

3. **Implementar backoff exponencial** — Para rate limits, aguarde 1s, 2s, 4s antes de retry.

4. **Usar timeouts apropriados** — Mínimo 30 segundos para operações de estoque bulk.

5. **Logar requisições significativas** — Registre ações de criação/atualização com timestamp.

6. **Validar parâmetros** — Use o schema do `describe_action` para validar antes de chamar.

7. **Tratar erro 'account_not_connected'** — Guiar usuário para conectar conta no dashboard.

## Documentação Adicional

- **API Completa**: https://marketplaces.tiops.com.br/docs/api.html
- **Dashboard**: https://marketplaces.tiops.com.br
- **Schema OpenAPI**: Disponível no repositório em `docs/openapi/openapi-gpt.yaml`

## Suporte

Para dúvidas ou problemas:
- Documentação técnica: https://marketplaces.tiops.com.br/docs/api.html
- Dashboard de suporte: https://marketplaces.tiops.com.br

---

**Última atualização**: 10 de julho de 2026
