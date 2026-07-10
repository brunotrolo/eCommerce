# MCP Tiops — Guia de Uso

> **Para um novo chat:** Este arquivo contém as instruções para explorar ao máximo o MCP Tiops e operar na Shopee e Mercado Livre. Comece aqui.

## O Que É

MCP Tiops dá acesso a **260+ ações** de marketplaces (Mercado Livre, Shopee, Shein, Bling, Olist) através da ferramenta `mcp__Tiops__marketplace_action`. Em vez de navegar no site, você executa ações diretamente e recebe o resultado em tempo real.

## Suas Contas Conectadas

```
Mercado Livre: meliUserId = 3520412809
Shopee:        shopId     = 1880105398
```

Sempre confirme os IDs atuais executando a ação `list_accounts`.

---

## Instruções Para Explorar o MCP ao Máximo

Siga esta ordem em um novo chat para descobrir e usar tudo que está disponível:

### 1. Descubra suas contas
Execute `list_accounts`. Retorna cada conta conectada com o `param_to_use` (ex: `meliUserId`, `shopId`) e o `value` a usar nas próximas ações.

### 2. Descubra todas as ações
Execute `list_actions`. Retorna as 260+ ações com nome, descrição e marketplace. Use isto para saber exatamente qual ação existe — **nunca invente nomes de ação**.

### 3. Entenda os parâmetros de uma ação
Antes de chamar qualquer ação nova, execute `describe_action` com `{ action_name: "nome_da_acao" }`. Retorna o schema: parâmetros obrigatórios, opcionais, tipos e valores permitidos.

### 4. Execute a ação
Com os parâmetros certos em mãos, chame a ação. Se der erro, a mensagem geralmente diz o que falta — corrija e tente de novo.

**Regra de ouro:** `list_accounts` → `list_actions` → `describe_action` → executar. Esse fluxo evita a maioria dos erros.

---

## Instruções de Uso Oficiais (documentação Tiops)

Fonte: https://marketplaces.tiops.com.br/docs/api.html

### Autenticação
Chave API obtida no dashboard, aba **"Agentes IA"** (formato `mc_live_XXXXXX`). Enviada via header:
- `Authorization: Bearer mc_live_XXXXXX`, ou
- `x-api-key: mc_live_XXXXXX`

> Ao usar a ferramenta `mcp__Tiops__marketplace_action`, a autenticação já está configurada — você só informa `action` e `params`.

### Endpoint
```
POST https://mcp.tiops.com.br
```

### Formato da Requisição
```json
{
  "action": "action_name",
  "params": { }
}
```

### Formato da Resposta
- **Sucesso:** `{ "status": 200, "data": { ... } }`
- **Erro:** `{ "error": "mensagem" }`

### Ações de Discovery (essenciais)
| Ação | O que retorna |
|------|---------------|
| `list_actions` | Todas as 260+ ações disponíveis |
| `describe_action` | Schema e parâmetros de uma ação |
| `list_accounts` | Contas conectadas e seus identificadores |

### Parâmetro Identificador Por Marketplace
| Marketplace | Parâmetro | Exemplo |
|-------------|-----------|---------|
| Mercado Livre | `meliUserId` | `3520412809` |
| Shopee | `shopId` | `1880105398` |
| Shein | `supplierId` | `2507079` |
| Bling | `authUserId` | atribuído automaticamente |

### Ações Por Marketplace
- **Mercado Livre:** itens, pedidos, anúncios (ads), perguntas, envios, categorias (60+ ações)
- **Shopee:** produtos, pedidos, ads, chat, devoluções, financeiro
- **Shein:** produtos, pedidos, estoque, financeiro, logística, compliance, certificados, devoluções (43 ações)
- **Bling ERP:** produtos, pedidos, estoque, contatos, notas fiscais — prefixo `erp_bling_*` (~60 ações)
- **Olist:** pedidos, produtos, cálculo de frete, contatos — prefixo `erp_olist_*` (178 ações)

### Erros Comuns
Chave inválida, token expirado, limite diário excedido, ação inexistente, créditos insuficientes. Ao encontrar uma ação desconhecida, confirme o nome com `list_actions`.

---

## Fluxo de Trabalho Típico

1. **`list_accounts`** — pegar os IDs das contas
2. **`list_actions`** — ver o que é possível fazer
3. **`describe_action`** — entender os parâmetros da ação escolhida
4. **Executar** — chamar a ação com os parâmetros corretos
5. **Verificar** — ler `data` na resposta; se `error`, corrigir e repetir

---

**Última atualização:** 2026-07-10
**Contas ativas:** Mercado Livre + Shopee
