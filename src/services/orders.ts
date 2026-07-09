import { MarketplaceClient } from '../client';
import { Order, OrderItem } from '../types';
import logger from '../logger';

export interface ListOrdersParams {
  marketplaceId: string;
  status?: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  offset?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export class OrdersService {
  private client: MarketplaceClient;

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async listOrders(params: ListOrdersParams): Promise<Order[]> {
    try {
      logger.info('Listing orders', { marketplace: params.marketplaceId });

      const response = await this.client.request('list_orders', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        status: params.status || 'all',
        offset: params.offset || 0,
        limit: params.limit || 50,
        ...(params.startDate && { start_date: params.startDate }),
        ...(params.endDate && { end_date: params.endDate })
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from list_orders');
      }

      return response.data as Order[];
    } catch (error) {
      logger.error('Failed to list orders', { error });
      throw error;
    }
  }

  async getOrderDetails(
    marketplaceId: string,
    orderId: string
  ): Promise<Order> {
    try {
      logger.info('Fetching order details', {
        marketplace: marketplaceId,
        orderId
      });

      const response = await this.client.request('get_order_details', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        order_id: orderId
      });

      if (!response.data) {
        throw new Error('Order not found');
      }

      return response.data as Order;
    } catch (error) {
      logger.error('Failed to get order details', { error });
      throw error;
    }
  }

  async updateOrderStatus(
    marketplaceId: string,
    orderId: string,
    status: string
  ): Promise<boolean> {
    try {
      logger.info('Updating order status', {
        marketplace: marketplaceId,
        orderId,
        newStatus: status
      });

      const response = await this.client.request('update_order_status', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        order_id: orderId,
        status
      });

      logger.info('Order status updated successfully');
      return !!response.status;
    } catch (error) {
      logger.error('Failed to update order status', { error });
      throw error;
    }
  }

  async getSalesMetrics(
    marketplaceId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  }> {
    try {
      logger.info('Fetching sales metrics', {
        marketplace: marketplaceId,
        startDate,
        endDate
      });

      const response = await this.client.request('get_sales_summary', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate })
      });

      if (!response.data) {
        throw new Error('No metrics returned');
      }

      return response.data as ReturnType<typeof this.getSalesMetrics>;
    } catch (error) {
      logger.error('Failed to fetch sales metrics', { error });
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
