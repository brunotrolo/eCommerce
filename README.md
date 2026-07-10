# Integração eCommerce Marketplace Connect API

Uma integração completa TypeScript/Node.js para a API Marketplace Connect, permitindo gerenciamento perfeito de múltiplos marketplaces incluindo Mercado Livre, Shopee, Shein, Bling ERP, Olist e mais.

## Recursos

- **Suporte Multi-Marketplace**: Integre com 6+ marketplaces e plataformas
- **Cobertura Completa da API**: 260+ ações disponíveis com descoberta e introspection
- **Arquitetura Orientada a Serviços**: Organizada por domínios funcionais (produtos, pedidos, campanhas, estoque, envios)
- **Segurança de Tipos**: Tipos TypeScript completos para todas as interações da API
- **Tratamento de Erros**: Log abrangente e gerenciamento de erros
- **Gerenciamento de Contas**: Suporte para múltiplas contas conectadas por marketplace
- **Extensível**: Fácil adicionar novos serviços e operações

## Marketplaces Suportados

- **Mercado Livre** - Itens, pedidos, anúncios, perguntas, envios, catálogo
- **Shopee** - Produtos, pedidos, anúncios, chat, devoluções, financeiro
- **Shein** - Produtos, pedidos, estoque, financeiro, envios, conformidade (43+ ações)
- **Bling ERP** - Produtos, pedidos, estoque, contatos, notas fiscais (60+ ações)
- **Olist** - Pedidos, produtos, envios, contatos (178+ ações)
- **Shopee Affiliates** - Busca, gerar links

## Instalação

```bash
npm install
```

## Configuração

Crie um arquivo `.env` no diretório raiz:

```env
MARKETPLACE_API_KEY=mc_live_XXXXXX
MARKETPLACE_API_ENDPOINT=https://mcp.tiops.com.br
LOG_LEVEL=info
NODE_ENV=development
```

Para desenvolvimento, você pode copiar de `.env.example`:

```bash
cp .env.example .env
```

## Compilação

```bash
npm run build
```

## Execução

```bash
npm start
```

## Desenvolvimento

Execute exemplos em modo de desenvolvimento:

```bash
npm run dev
```

## Serviços Principais

### 1. Serviço de Descoberta

Descubra ações disponíveis e contas conectadas.

```typescript
import MarketplaceConnectAPI from './api';
import config from './config';

const api = new MarketplaceConnectAPI(config);

// Listar todas as ações disponíveis (260+)
const allActions = await api.discovery.listAllActions();

// Descrever uma ação específica com seus parâmetros
const actionDetails = await api.discovery.describeAction('shopee_sales_summary');

// Obter todas as contas conectadas
const accounts = await api.discovery.listConnectedAccounts();

// Obter conta para um marketplace específico
const shopeeAccount = await api.discovery.getAccountByMarketplace('shopee');
```

### 2. Serviço de Produtos

Gerencie produtos em múltiplos marketplaces.

```typescript
// Listar produtos ativos
const products = await api.products.listProducts({
  marketplaceId: 'shop123',
  limit: 50,
  status: 'active'
});

// Buscar produtos
const results = await api.products.searchProducts({
  marketplaceId: 'shop123',
  query: 'laptop',
  limit: 20
});

// Obter informações detalhadas do produto
const product = await api.products.getProductDetails('shop123', 'prod456');
```

### 3. Serviço de Pedidos

Gerencie e acompanhe pedidos.

```typescript
// Listar pedidos com filtros
const orders = await api.orders.listOrders({
  marketplaceId: 'shop123',
  status: 'pending',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});

// Obter detalhes do pedido
const order = await api.orders.getOrderDetails('shop123', 'order789');

// Atualizar status do pedido
await api.orders.updateOrderStatus('shop123', 'order789', 'shipped');

// Obter métricas de vendas
const metrics = await api.orders.getSalesMetrics('shop123');
// Retorna: { totalOrders, totalRevenue, averageOrderValue }
```

### 4. Serviço de Campanhas

Gerencie campanhas de publicidade.

```typescript
// Listar campanhas ativas
const campaigns = await api.campaigns.listCampaigns({
  marketplaceId: 'shop123',
  status: 'active'
});

// Obter detalhes da campanha
const campaign = await api.campaigns.getCampaignDetails('shop123', 'camp123');

// Criar nova campanha
const newCampaign = await api.campaigns.createCampaign({
  marketplaceId: 'shop123',
  name: 'Venda de Verão 2024',
  type: 'sponsored',
  budget: 1000,
  dailyBudget: 100,
  productIds: ['prod1', 'prod2', 'prod3'],
  keywords: ['laptop', 'computador']
});

// Atualizar status da campanha
await api.campaigns.updateCampaignStatus('shop123', 'camp123', 'paused');
```

### 5. Serviço de Estoque

Gerencie estoque e inventário de produtos.

```typescript
// Obter informações de estoque de um produto
const stock = await api.inventory.getStockInfo('shop123', 'prod456');
// Retorna: { productId, sku, currentStock, reservedStock, availableStock }

// Atualizar estoque (definir/adicionar/subtrair)
const updated = await api.inventory.updateStock({
  marketplaceId: 'shop123',
  productId: 'prod456',
  quantity: 100,
  type: 'set'
});

// Atualização em lote de múltiplos produtos
const result = await api.inventory.bulkUpdateStock('shop123', [
  { productId: 'prod1', quantity: 50, type: 'set' },
  { productId: 'prod2', quantity: 10, type: 'add' },
  { productId: 'prod3', quantity: 5, type: 'subtract' }
]);
// Retorna: { succeeded, failed }

// Encontrar todos os produtos com estoque baixo
const lowStock = await api.inventory.getLowStockProducts('shop123', 20);
```

### 6. Serviço de Envios

Gerencie remessas e métodos de envio.

```typescript
// Rastrear remessa
const shipment = await api.shipping.trackShipment({
  marketplaceId: 'shop123',
  orderId: 'order789'
});

// Obter métodos de envio disponíveis
const methods = await api.shipping.getShippingMethods({
  marketplaceId: 'shop123',
  origin: 'CEP_00000',
  destination: 'CEP_00000',
  weight: 2.5
});

// Gerar etiqueta de envio
const label = await api.shipping.generateShippingLabel(
  'shop123',
  'order789',
  'ship_method_123'
);
// Retorna: { labelUrl, trackingNumber }

// Atualizar status da remessa
await api.shipping.updateShipmentStatus('shop123', 'ship123', 'in_transit');
```

## Referência da API

### Suporte Multi-Conta

Cada conta tem um parâmetro identificador único baseado no marketplace:

- **Mercado Libre**: `meliUserId`
- **Shopee**: `shopId`
- **Shein**: `supplierId`
- **Olist**: `sellerId`
- **Bling ERP**: `accountId`

Todos os serviços mapeiam automaticamente o nome do marketplace para o parâmetro correto.

## Formato de Resposta

Todas as respostas da API seguem um formato consistente:

```typescript
interface ApiResponse<T> {
  status: number;
  data?: T;
  error?: string;
}
```

## Tratamento de Erros

Todos os serviços incluem tratamento e log de erros abrangentes:

```typescript
try {
  const products = await api.products.listProducts({
    marketplaceId: 'shop123',
    limit: 50
  });
} catch (error) {
  // Erros são registrados automaticamente
  // Acesse detalhes do erro via error.message
  console.error(error.message);
}
```

Erros são registrados automaticamente em:
- Console (saída formatada)
- `logs/error.log` (apenas erros)
- `logs/combined.log` (todos os logs)

## Testes

```bash
npm test
```

## Estrutura do Projeto

```
src/
├── api.ts              # Classe API principal que combina todos os serviços
├── client.ts           # Cliente HTTP para comunicação com a API
├── config.ts           # Gerenciamento de configuração
├── discovery.ts        # Serviço de descoberta e introspection
├── logger.ts           # Configuração de logging
├── types.ts            # Interfaces TypeScript
├── services/
│   ├── campaigns.ts    # Gerenciamento de campanhas
│   ├── inventory.ts    # Gerenciamento de estoque
│   ├── orders.ts       # Gerenciamento de pedidos
│   ├── products.ts     # Gerenciamento de produtos
│   └── shipping.ts     # Gerenciamento de envios
├── examples.ts         # Exemplo de uso
└── index.ts            # Exportações principais
```

## Uso Avançado

### Ações Personalizadas

Chame qualquer uma das 260+ ações disponíveis diretamente:

```typescript
const api = new MarketplaceConnectAPI(config);
const client = api.getClient();

// Chamada direta da API
const response = await client.request('custom_action_name', {
  marketplaceId: 'shop123',
  customParam: 'value'
});
```

### Descoberta de Ações com Parâmetros

Antes de chamar uma ação, descubra seus parâmetros:

```typescript
const actionDetails = await api.discovery.describeAction('shopee_sales_summary');
console.log(actionDetails);
// {
//   name: 'shopee_sales_summary',
//   description: 'Obter resumo de vendas de uma loja',
//   params: { shopId, dateRange, ... },
//   marketplace: 'shopee'
// }
```

### Verificação de Saúde

Verifique a conexão com a API:

```typescript
const isHealthy = await api.healthCheck();
if (isHealthy) {
  console.log('Conectado a todos os marketplaces');
}
```

## Solução de Problemas

### Erros de Autenticação

Certifique-se de que seu `MARKETPLACE_API_KEY` está correto e inclui o prefixo `mc_live_`:

```bash
# Errado
MARKETPLACE_API_KEY=XXXXXX

# Correto
MARKETPLACE_API_KEY=mc_live_XXXXXX
```

### Nenhuma Conta Conectada

Se `listConnectedAccounts()` retornar vazio, certifique-se de ter conectado pelo menos uma conta de marketplace através do painel Marketplace Connect.

### Limitação de Taxa

A API suporta paginação com parâmetros `offset` e `limit`. Para conjuntos de dados grandes:

```typescript
const allProducts = [];
let offset = 0;
const limit = 50;

while (true) {
  const batch = await api.products.listProducts({
    marketplaceId: 'shop123',
    offset,
    limit
  });

  if (batch.length === 0) break;

  allProducts.push(...batch);
  offset += limit;
}
```

## Links de Documentação

- [Documentação da API Marketplace Connect](https://marketplaces.tiops.com.br/docs/api.html)
- [Endpoint da API](https://mcp.tiops.com.br)

## Licença

MIT

## Suporte

Para questões ou dúvidas, consulte a [documentação do Marketplace Connect](https://marketplaces.tiops.com.br/docs/api.html).
