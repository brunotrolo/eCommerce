# eCommerce Marketplace Connect API Integration

A comprehensive TypeScript/Node.js integration for the Marketplace Connect API, enabling seamless multi-marketplace management across Mercado Livre, Shopee, Shein, Bling ERP, Olist, and more.

## Features

- **Multi-Marketplace Support**: Integrate with 6+ marketplaces and platforms
- **Complete API Coverage**: 260+ available actions with discovery and introspection
- **Service-Oriented Architecture**: Organized by functional domains (products, orders, campaigns, inventory, shipping)
- **Type Safety**: Full TypeScript types for all API interactions
- **Error Handling**: Comprehensive logging and error management
- **Account Management**: Support for multiple connected accounts per marketplace
- **Extensible**: Easy to add new services and operations

## Supported Marketplaces

- **Mercado Livre** - Items, orders, ads, questions, shipping, catalog
- **Shopee** - Products, orders, ads, chat, returns, finance
- **Shein** - Products, orders, inventory, finance, shipping, compliance (43+ actions)
- **Bling ERP** - Products, orders, stock, contacts, invoices (60+ actions)
- **Olist** - Orders, products, shipping, contacts (178+ actions)
- **Shopee Affiliates** - Search, generate links

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
MARKETPLACE_API_KEY=mc_live_XXXXXX
MARKETPLACE_API_ENDPOINT=https://mcp.tiops.com.br
LOG_LEVEL=info
NODE_ENV=development
```

For development, you can copy from `.env.example`:

```bash
cp .env.example .env
```

## Building

```bash
npm run build
```

## Running

```bash
npm start
```

## Development

Run examples in development mode:

```bash
npm run dev
```

## Core Services

### 1. Discovery Service

Discover available actions and connected accounts.

```typescript
import MarketplaceConnectAPI from './api';
import config from './config';

const api = new MarketplaceConnectAPI(config);

// List all available actions (260+)
const allActions = await api.discovery.listAllActions();

// Describe a specific action with its parameters
const actionDetails = await api.discovery.describeAction('shopee_sales_summary');

// Get all connected accounts
const accounts = await api.discovery.listConnectedAccounts();

// Get account for a specific marketplace
const shopeeAccount = await api.discovery.getAccountByMarketplace('shopee');
```

### 2. Products Service

Manage products across marketplaces.

```typescript
// List active products
const products = await api.products.listProducts({
  marketplaceId: 'shop123',
  limit: 50,
  status: 'active'
});

// Search for products
const results = await api.products.searchProducts({
  marketplaceId: 'shop123',
  query: 'laptop',
  limit: 20
});

// Get detailed product information
const product = await api.products.getProductDetails('shop123', 'prod456');
```

### 3. Orders Service

Manage and track orders.

```typescript
// List orders with filters
const orders = await api.orders.listOrders({
  marketplaceId: 'shop123',
  status: 'pending',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});

// Get order details
const order = await api.orders.getOrderDetails('shop123', 'order789');

// Update order status
await api.orders.updateOrderStatus('shop123', 'order789', 'shipped');

// Get sales metrics
const metrics = await api.orders.getSalesMetrics('shop123');
// Returns: { totalOrders, totalRevenue, averageOrderValue }
```

### 4. Campaigns Service

Manage advertising campaigns.

```typescript
// List active campaigns
const campaigns = await api.campaigns.listCampaigns({
  marketplaceId: 'shop123',
  status: 'active'
});

// Get campaign details
const campaign = await api.campaigns.getCampaignDetails('shop123', 'camp123');

// Create a new campaign
const newCampaign = await api.campaigns.createCampaign({
  marketplaceId: 'shop123',
  name: 'Summer Sale 2024',
  type: 'sponsored',
  budget: 1000,
  dailyBudget: 100,
  productIds: ['prod1', 'prod2', 'prod3'],
  keywords: ['laptop', 'computer']
});

// Update campaign status
await api.campaigns.updateCampaignStatus('shop123', 'camp123', 'paused');
```

### 5. Inventory Service

Manage product stock and inventory.

```typescript
// Get stock information for a product
const stock = await api.inventory.getStockInfo('shop123', 'prod456');
// Returns: { productId, sku, currentStock, reservedStock, availableStock }

// Update stock (set/add/subtract)
const updated = await api.inventory.updateStock({
  marketplaceId: 'shop123',
  productId: 'prod456',
  quantity: 100,
  type: 'set'
});

// Bulk update multiple products
const result = await api.inventory.bulkUpdateStock('shop123', [
  { productId: 'prod1', quantity: 50, type: 'set' },
  { productId: 'prod2', quantity: 10, type: 'add' },
  { productId: 'prod3', quantity: 5, type: 'subtract' }
]);
// Returns: { succeeded, failed }

// Find all products with low stock
const lowStock = await api.inventory.getLowStockProducts('shop123', 20);
```

### 6. Shipping Service

Manage shipments and shipping methods.

```typescript
// Track a shipment
const shipment = await api.shipping.trackShipment({
  marketplaceId: 'shop123',
  orderId: 'order789'
});

// Get available shipping methods
const methods = await api.shipping.getShippingMethods({
  marketplaceId: 'shop123',
  origin: 'CEP_00000',
  destination: 'CEP_00000',
  weight: 2.5
});

// Generate shipping label
const label = await api.shipping.generateShippingLabel(
  'shop123',
  'order789',
  'ship_method_123'
);
// Returns: { labelUrl, trackingNumber }

// Update shipment status
await api.shipping.updateShipmentStatus('shop123', 'ship123', 'in_transit');
```

## API Reference

### Multi-Account Support

Each account has a unique identifier parameter based on the marketplace:

- **Mercado Libre**: `meliUserId`
- **Shopee**: `shopId`
- **Shein**: `supplierId`
- **Olist**: `sellerId`
- **Bling ERP**: `accountId`

All services automatically map the marketplace name to the correct parameter.

## Response Format

All API responses follow a consistent format:

```typescript
interface ApiResponse<T> {
  status: number;
  data?: T;
  error?: string;
}
```

## Error Handling

All services include comprehensive error handling and logging:

```typescript
try {
  const products = await api.products.listProducts({
    marketplaceId: 'shop123',
    limit: 50
  });
} catch (error) {
  // Errors are logged automatically
  // Access error details via error.message
  console.error(error.message);
}
```

Errors are automatically logged to:
- Console (formatted output)
- `logs/error.log` (errors only)
- `logs/combined.log` (all logs)

## Testing

```bash
npm test
```

## Project Structure

```
src/
├── api.ts              # Main API class combining all services
├── client.ts           # HTTP client for API communication
├── config.ts           # Configuration management
├── discovery.ts        # Discovery and introspection service
├── logger.ts           # Logging configuration
├── types.ts            # TypeScript interfaces
├── services/
│   ├── campaigns.ts    # Campaign management
│   ├── inventory.ts    # Inventory/stock management
│   ├── orders.ts       # Order management
│   ├── products.ts     # Product management
│   └── shipping.ts     # Shipping management
├── examples.ts         # Example usage
└── index.ts            # Main exports
```

## Advanced Usage

### Custom Actions

Call any of the 260+ available actions directly:

```typescript
const api = new MarketplaceConnectAPI(config);
const client = api.getClient();

// Direct API call
const response = await client.request('custom_action_name', {
  marketplaceId: 'shop123',
  customParam: 'value'
});
```

### Action Discovery with Parameters

Before calling an action, discover its parameters:

```typescript
const actionDetails = await api.discovery.describeAction('shopee_sales_summary');
console.log(actionDetails);
// {
//   name: 'shopee_sales_summary',
//   description: 'Get sales summary for a shop',
//   params: { shopId, dateRange, ... },
//   marketplace: 'shopee'
// }
```

### Health Checks

Verify the API connection:

```typescript
const isHealthy = await api.healthCheck();
if (isHealthy) {
  console.log('Connected to all marketplaces');
}
```

## Troubleshooting

### Authentication Errors

Ensure your `MARKETPLACE_API_KEY` is correct and includes the `mc_live_` prefix:

```bash
# Wrong
MARKETPLACE_API_KEY=XXXXXX

# Correct
MARKETPLACE_API_KEY=mc_live_XXXXXX
```

### No Connected Accounts

If `listConnectedAccounts()` returns empty, ensure you've connected at least one marketplace account through the Marketplace Connect dashboard.

### Rate Limiting

The API supports pagination with `offset` and `limit` parameters. For large datasets:

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

## Documentation Links

- [Marketplace Connect API Docs](https://marketplaces.tiops.com.br/docs/api.html)
- [API Endpoint](https://mcp.tiops.com.br)

## License

MIT

## Support

For issues or questions, refer to the [Marketplace Connect documentation](https://marketplaces.tiops.com.br/docs/api.html).
