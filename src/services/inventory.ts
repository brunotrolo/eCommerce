import { MarketplaceClient } from '../client';
import logger from '../logger';

export interface StockInfo {
  productId: string;
  sku: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  warehouse?: string;
}

export interface UpdateStockParams {
  marketplaceId: string;
  productId: string;
  quantity: number;
  type: 'set' | 'add' | 'subtract';
}

export class InventoryService {
  private client: MarketplaceClient;

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async getStockInfo(
    marketplaceId: string,
    productId: string
  ): Promise<StockInfo> {
    try {
      logger.info('Fetching stock info', {
        marketplace: marketplaceId,
        productId
      });

      const response = await this.client.request('get_stock_info', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        product_id: productId
      });

      if (!response.data) {
        throw new Error('Stock info not found');
      }

      return response.data as StockInfo;
    } catch (error) {
      logger.error('Failed to get stock info', { error });
      throw error;
    }
  }

  async updateStock(params: UpdateStockParams): Promise<StockInfo> {
    try {
      logger.info('Updating stock', {
        marketplace: params.marketplaceId,
        productId: params.productId,
        quantity: params.quantity,
        type: params.type
      });

      const response = await this.client.request('update_stock', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        product_id: params.productId,
        quantity: params.quantity,
        type: params.type
      });

      if (!response.data) {
        throw new Error('Failed to update stock');
      }

      logger.info('Stock updated successfully');
      return response.data as StockInfo;
    } catch (error) {
      logger.error('Failed to update stock', { error });
      throw error;
    }
  }

  async bulkUpdateStock(
    marketplaceId: string,
    updates: Array<{
      productId: string;
      quantity: number;
      type: 'set' | 'add' | 'subtract';
    }>
  ): Promise<{ succeeded: number; failed: number }> {
    try {
      logger.info('Bulk updating stock', {
        marketplace: marketplaceId,
        updateCount: updates.length
      });

      const response = await this.client.request('bulk_update_stock', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        updates
      });

      if (!response.data) {
        throw new Error('Bulk update failed');
      }

      return response.data as ReturnType<typeof this.bulkUpdateStock>;
    } catch (error) {
      logger.error('Failed to bulk update stock', { error });
      throw error;
    }
  }

  async getLowStockProducts(
    marketplaceId: string,
    threshold: number = 10
  ): Promise<StockInfo[]> {
    try {
      logger.info('Fetching low stock products', {
        marketplace: marketplaceId,
        threshold
      });

      const response = await this.client.request('get_low_stock_products', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        threshold
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format');
      }

      return response.data as StockInfo[];
    } catch (error) {
      logger.error('Failed to fetch low stock products', { error });
      throw error;
    }
  }

  private getMarketplaceIdParam(marketplace: string): string {
    const paramMap: Record<string, string> = {
      mercado_libre: 'meliUserId',
      shopee: 'shopId',
      shein: 'supplierId',
      olist: 'sellerId',
      bling: 'accountId'
    };
    return paramMap[marketplace.toLowerCase()] || `${marketplace}Id`;
  }
}
