import MarketplaceConnectAPI from './api';
import config from './config';
import logger from './logger';

async function runExamples() {
  try {
    const api = new MarketplaceConnectAPI(config);

    logger.info('=== Marketplace Connect API Examples ===\n');

    // Example 1: Discovery - List all available actions
    logger.info('1. Discovering available actions...');
    const actions = await api.discovery.listAllActions();
    logger.info(`Found ${actions.total} available actions`, {
      sample: actions.actions.slice(0, 3).map(a => a.name)
    });

    // Example 2: Get connected accounts
    logger.info('\n2. Fetching connected accounts...');
    const accounts = await api.discovery.listConnectedAccounts();
    logger.info(`Found ${accounts.total} connected accounts`);

    if (accounts.accounts.length === 0) {
      logger.warn(
        'No connected accounts found. Please connect a marketplace account.'
      );
      return;
    }

    const account = accounts.accounts[0];
    logger.info(`Using account: ${account.name} (${account.marketplace})`);

    // Example 3: List products
    logger.info('\n3. Listing products...');
    const products = await api.products.listProducts({
      marketplaceId: account.value,
      limit: 10,
      status: 'active'
    });
    logger.info(`Retrieved ${products.length} products`);
    if (products.length > 0) {
      logger.info('Sample product:', products[0]);
    }

    // Example 4: List orders
    logger.info('\n4. Listing orders...');
    const orders = await api.orders.listOrders({
      marketplaceId: account.value,
      limit: 10,
      status: 'pending'
    });
    logger.info(`Retrieved ${orders.length} orders`);
    if (orders.length > 0) {
      logger.info('Sample order:', {
        id: orders[0].id,
        status: orders[0].status,
        totalPrice: orders[0].totalPrice
      });
    }

    // Example 5: Get sales metrics
    logger.info('\n5. Fetching sales metrics...');
    const metrics = await api.orders.getSalesMetrics(account.value);
    logger.info('Sales metrics:', metrics);

    // Example 6: List campaigns
    logger.info('\n6. Listing campaigns...');
    const campaigns = await api.campaigns.listCampaigns({
      marketplaceId: account.value,
      limit: 10
    });
    logger.info(`Retrieved ${campaigns.length} campaigns`);
    if (campaigns.length > 0) {
      logger.info('Sample campaign:', {
        id: campaigns[0].id,
        name: campaigns[0].name,
        status: campaigns[0].status,
        budget: campaigns[0].budget
      });
    }

    // Example 7: Get low stock products
    logger.info('\n7. Checking low stock products...');
    const lowStockProducts = await api.inventory.getLowStockProducts(
      account.value,
      20
    );
    logger.info(`Found ${lowStockProducts.length} products with low stock`);
    if (lowStockProducts.length > 0) {
      logger.info('Low stock products:', lowStockProducts.slice(0, 3));
    }

    // Example 8: Get available shipping methods
    if (orders.length > 0) {
      logger.info('\n8. Fetching shipping methods...');
      // Assuming order has shipping info with origin/destination
      const methods = await api.shipping.getShippingMethods({
        marketplaceId: account.value,
        origin: 'CEP_00000',
        destination: 'CEP_00000',
        weight: 1.5
      });
      logger.info(`Available shipping methods: ${methods.length}`);
      if (methods.length > 0) {
        logger.info('Sample methods:', methods.slice(0, 2));
      }
    }

    logger.info('\n=== Examples completed successfully ===');
  } catch (error) {
    logger.error('Error running examples', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  runExamples();
}

export { runExamples };
