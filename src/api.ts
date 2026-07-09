import { MarketplaceConfig } from './types';
import { MarketplaceClient } from './client';
import { DiscoveryService } from './discovery';
import { ProductsService } from './services/products';
import { OrdersService } from './services/orders';
import { CampaignsService } from './services/campaigns';
import { InventoryService } from './services/inventory';
import { ShippingService } from './services/shipping';
import logger from './logger';

export class MarketplaceConnectAPI {
  private client: MarketplaceClient;
  public discovery: DiscoveryService;
  public products: ProductsService;
  public orders: OrdersService;
  public campaigns: CampaignsService;
  public inventory: InventoryService;
  public shipping: ShippingService;

  constructor(config: MarketplaceConfig) {
    this.client = new MarketplaceClient(config);
    this.discovery = new DiscoveryService(this.client);
    this.products = new ProductsService(this.client);
    this.orders = new OrdersService(this.client);
    this.campaigns = new CampaignsService(this.client);
    this.inventory = new InventoryService(this.client);
    this.shipping = new ShippingService(this.client);

    logger.info('MarketplaceConnectAPI initialized', {
      endpoint: config.endpoint
    });
  }

  getClient(): MarketplaceClient {
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const accounts = await this.discovery.listConnectedAccounts();
      logger.info('Health check passed', {
        accountsCount: accounts.total
      });
      return true;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }
}

export default MarketplaceConnectAPI;
