# MCP Client - Marketplace Connect Protocol

Cliente otimizado para a **Marketplace Connect API** com suporte a descoberta de ações, cache inteligente e retry automático.

## Features

✨ **Descoberta Automática** - Listar 260+ ações disponíveis  
✨ **Introspection** - Descrever schema e parâmetros de qualquer ação  
✨ **Cache Inteligente** - Cache com TTL de 1 hora  
✨ **Validação de Parâmetros** - Validar contra schema antes de executar  
✨ **Retry Automático** - Backoff exponencial para erros temporários  
✨ **Multi-Marketplace** - Suporte para múltiplas contas e marketplaces  
✨ **Logging Completo** - Winston logger integrado  

## Instalação

```bash
npm install
```

## Uso Básico

### Inicializar Client

```typescript
import McpClient from './mcp-client';

const client = new McpClient('mc_live_YOUR_KEY');
```

### Descobrir Ações

```typescript
// Listar todas as 260+ ações
const actions = await client.discoverActions();

console.log(`Total: ${actions.length}`);
actions.forEach(action => {
  console.log(`${action.name} - ${action.description}`);
});
```

### Descrever Ação

```typescript
// Obter parâmetros de uma ação específica
const descriptor = await client.describeAction('shopee_sales_summary');

console.log(`Parâmetros:`);
Object.entries(descriptor.params).forEach(([name, spec]) => {
  console.log(`  ${name}: ${spec.type}${spec.required ? ' (obrigatório)' : ''}`);
});
```

### Listar Contas

```typescript
// Obter todas as contas conectadas
const accounts = await client.listAccounts();

accounts.forEach(account => {
  console.log(`${account.name} (${account.marketplace})`);
  console.log(`  ID Parameter: ${account.param_to_use}`);
  console.log(`  Value: ${account.value}`);
});
```

### Executar Ação

```typescript
// Executar qualquer ação
const result = await client.call('shopee_sales_summary', {
  shopId: 'shop_123456',
  dateRange: 'last_30_days'
});

if (result.data) {
  console.log(result.data);
} else if (result.error) {
  console.error(result.error);
}
```

## API Reference

### `discoverActions(useCache?: boolean): Promise<McpAction[]>`

Listar todas as 260+ ações disponíveis.

```typescript
const actions = await client.discoverActions();
const actionsNoCache = await client.discoverActions(false);
```

### `describeAction(actionName: string, useCache?: boolean): Promise<McpActionDescriptor>`

Obter schema completo de uma ação.

```typescript
const descriptor = await client.describeAction('shopee_sales_summary');
console.log(descriptor.params);
```

### `listAccounts(useCache?: boolean): Promise<McpAccount[]>`

Listar contas conectadas com seus parâmetros.

```typescript
const accounts = await client.listAccounts();
const account = accounts[0];
console.log(`${account.param_to_use}: ${account.value}`);
```

### `getAccountByMarketplace(marketplace: string, useCache?: boolean): Promise<McpAccount | undefined>`

Obter primeira conta de um marketplace.

```typescript
const shopeeAccount = await client.getAccountByMarketplace('shopee');
if (shopeeAccount) {
  console.log(`Shop ID: ${shopeeAccount.value}`);
}
```

### `getAccountsByMarketplace(marketplace: string, useCache?: boolean): Promise<McpAccount[]>`

Obter todas as contas de um marketplace.

```typescript
const shopeeAccounts = await client.getAccountsByMarketplace('shopee');
console.log(`Total de lojas Shopee: ${shopeeAccounts.length}`);
```

### `findActionsByMarketplace(marketplace: string, useCache?: boolean): Promise<McpAction[]>`

Buscar todas as ações de um marketplace.

```typescript
const shopeeActions = await client.findActionsByMarketplace('shopee');
console.log(`Ações Shopee: ${shopeeActions.length}`);
```

### `searchActions(pattern: string, useCache?: boolean): Promise<McpAction[]>`

Buscar ações por padrão de nome ou descrição.

```typescript
const salesActions = await client.searchActions('sales');
const inventoryActions = await client.searchActions('inventory|estoque');
```

### `validateParams(actionName: string, params: Record<string, unknown>): Promise<{valid: boolean, errors: string[]}>`

Validar parâmetros contra o schema de uma ação.

```typescript
const validation = await client.validateParams('shopee_sales_summary', {
  shopId: 'shop_123456',
  dateRange: 'last_30_days'
});

if (!validation.valid) {
  console.error('Erros:', validation.errors);
}
```

### `callWithValidation<T>(actionName: string, params?: Record<string, unknown>, maxRetries?: number): Promise<McpApiResponse<T>>`

Executar ação com validação e retry automático.

```typescript
const result = await client.callWithValidation(
  'shopee_sales_summary',
  {
    shopId: 'shop_123456',
    dateRange: 'last_30_days'
  },
  3 // máximo 3 tentativas
);
```

### `callWithRetry<T>(action: string, params?: Record<string, unknown>, maxRetries?: number): Promise<McpApiResponse<T>>`

Executar ação com retry automático e backoff exponencial.

```typescript
const result = await client.callWithRetry(
  'shopee_sales_summary',
  { shopId: 'shop_123456' },
  3
);
```

### `clearCache(type?: 'actions' | 'descriptors' | 'accounts' | 'all'): void`

Limpar cache.

```typescript
client.clearCache('actions');        // Limpar cache de ações
client.clearCache('all');            // Limpar tudo
```

### `getCacheStats(): Object`

Obter estatísticas do cache.

```typescript
const stats = client.getCacheStats();
console.log(`Ações em cache: ${stats.actions}`);
console.log(`Total: ${stats.total}`);
```

## Exemplo Completo

```typescript
import McpClient from './mcp-client';
import logger from '../logger';

async function main() {
  const client = new McpClient('mc_live_YOUR_KEY');

  try {
    // 1. Descobrir ações
    console.log('Descobrindo ações...');
    const actions = await client.discoverActions();
    console.log(`Encontradas ${actions.length} ações\n`);

    // 2. Listar contas conectadas
    console.log('Listando contas conectadas...');
    const accounts = await client.listAccounts();
    console.log(`Encontradas ${accounts.length} contas\n`);

    // 3. Buscar ações de um marketplace
    console.log('Buscando ações do Shopee...');
    const shopeeActions = await client.findActionsByMarketplace('shopee');
    console.log(`Shopee tem ${shopeeActions.length} ações\n`);

    // 4. Descrever uma ação
    console.log('Descrevendo ação shopee_sales_summary...');
    const descriptor = await client.describeAction('shopee_sales_summary');
    console.log(`Parâmetros: ${Object.keys(descriptor.params).join(', ')}\n`);

    // 5. Validar parâmetros
    console.log('Validando parâmetros...');
    const shopeeAccount = await client.getAccountByMarketplace('shopee');
    
    if (shopeeAccount) {
      const validation = await client.validateParams(
        'shopee_sales_summary',
        {
          shopId: shopeeAccount.value,
          dateRange: 'last_30_days'
        }
      );

      if (validation.valid) {
        // 6. Executar ação com retry
        console.log('Executando ação...');
        const result = await client.callWithValidation(
          'shopee_sales_summary',
          {
            shopId: shopeeAccount.value,
            dateRange: 'last_30_days'
          }
        );

        console.log('Resultado:', result.data);
      } else {
        console.error('Parâmetros inválidos:', validation.errors);
      }
    }

    // 7. Ver estatísticas de cache
    console.log('\nEstatísticas de cache:', client.getCacheStats());

  } catch (error) {
    logger.error('Erro', { error });
  }
}

main();
```

## Tratamento de Erros

### Erro: "Invalid API key"

```typescript
try {
  const actions = await client.discoverActions();
} catch (error) {
  if (error.message.includes('invalid_api_key')) {
    console.error('Chave API inválida. Verifique em marketplaces.tiops.com.br');
  }
}
```

### Erro: "Account not connected"

```typescript
try {
  const result = await client.call('shopee_sales_summary', { shopId: 'xxx' });
} catch (error) {
  if (error.message.includes('account_not_connected')) {
    console.error('Conecte sua conta no dashboard');
  }
}
```

### Retry Automático

O cliente tenta automaticamente 3 vezes para erros recuperáveis (rate limit, timeout):

```typescript
// Vai tentar 3 vezes com backoff exponencial: 1s, 2s, 4s
const result = await client.callWithRetry('action', {}, 3);
```

## Cache

O cache é automático com TTL de 1 hora:

```typescript
// Primeira chamada: consulta API
await client.discoverActions();

// Segunda chamada: retorna do cache (rápido)
await client.discoverActions();

// Sem cache
await client.discoverActions(false);

// Limpar cache manualmente
client.clearCache('all');
```

## Logging

Todos os eventos são registrados com Winston:

```
[MCP] Executando ação: shopee_sales_summary
[MCP] Ação shopee_sales_summary completada com sucesso
[MCP] Descobertas 260 ações
```

## Performance

- **Descoberta de ações**: ~500ms (primeira vez), <1ms (cache)
- **Descrever ação**: ~300ms (primeira vez), <1ms (cache)
- **Listar contas**: ~200ms (primeira vez), <1ms (cache)
- **Executar ação**: ~1-5s (depende da ação)

## Limitações

- Rate limit varia por conta (consultar dashboard)
- Timeout padrão: 30 segundos
- Cache expira após 1 hora
- Máximo 500 itens por página em listas

## Contribuindo

Para adicionar novas funcionalidades:

1. Estender a classe `McpClient`
2. Adicionar testes em `src/__tests__/`
3. Atualizar documentação
4. Fazer commit com mensagem clara

## Documentação Adicional

- **Guia MCP Completo**: `MARKETPLACE_CONNECT_MCP.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Exemplos**: `mcp-examples.ts`

---

**Última atualização**: 10 de julho de 2026
