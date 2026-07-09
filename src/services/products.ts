import { MarketplaceClient } from '../client';
import { Product } from '../types';
import logger from '../logger';

export interface ListProductsParams {
  marketplaceId: string;
  offset?: number;
  limit?: number;
  status?: 'active' | 'inactive' | 'paused';
}

export interface SearchProductsParams {
  marketplaceId: string;
  query: string;
  offset?: number;
  limit?: number;
}

export class ProductsService {
  private client: MarketplaceClient;

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async listProducts(params: ListProductsParams): Promise<Product[]> {
    try {
      logger.info('Listing products', { marketplace: params.marketplaceId });

      const response = await this.client.request('list_products', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        offset: params.offset || 0,
        limit: params.limit || 50,
        status: params.status || 'active'
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from list_products');
      }

      return response.data as Product[];
    } catch (error) {
      logger.error('Failed to list products', { error });
      throw error;
    }
  }

  async searchProducts(params: SearchProductsParams): Promise<Product[]> {
    try {
      logger.info('Searching products', {
        marketplace: params.marketplaceId,
        query: params.query
      });

      const response = await this.client.request('search_products', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        query: params.query,
        offset: params.offset || 0,
        limit: params.limit || 20
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from search_products');
      }

      return response.data as Product[];
    } catch (error) {
      logger.error('Failed to search products', { error });
      throw error;
    }
  }

  async getProductDetails(
    marketplaceId: string,
    productId: string
  ): Promise<Product> {
    try {
      logger.info('Fetching product details', {
        marketplace: marketplaceId,
        productId
      });

      const response = await this.client.request('get_product_details', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        product_id: productId
      });

      if (!response.data) {
        throw new Error('No product found');
      }

      return response.data as Product;
    } catch (error) {
      logger.error('Failed to get product details', { error });
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
