import { MarketplaceClient } from '../client';
import { ShippingInfo } from '../types';
import logger from '../logger';

export interface TrackShipmentParams {
  marketplaceId: string;
  orderId: string;
  shipmentId?: string;
}

export interface GetShippingMethodsParams {
  marketplaceId: string;
  origin: string;
  destination: string;
  weight: number;
}

export interface ShippingMethod {
  id: string;
  name: string;
  estimatedDays: number;
  cost: number;
  provider: string;
}

export class ShippingService {
  private client: MarketplaceClient;

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async trackShipment(params: TrackShipmentParams): Promise<ShippingInfo> {
    try {
      logger.info('Tracking shipment', {
        marketplace: params.marketplaceId,
        orderId: params.orderId
      });

      const response = await this.client.request('get_shipment_info', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        order_id: params.orderId,
        ...(params.shipmentId && { shipment_id: params.shipmentId })
      });

      if (!response.data) {
        throw new Error('Shipment not found');
      }

      return response.data as ShippingInfo;
    } catch (error) {
      logger.error('Failed to track shipment', { error });
      throw error;
    }
  }

  async getShippingMethods(
    params: GetShippingMethodsParams
  ): Promise<ShippingMethod[]> {
    try {
      logger.info('Fetching shipping methods', {
        marketplace: params.marketplaceId,
        origin: params.origin,
        destination: params.destination
      });

      const response = await this.client.request('get_shipping_methods', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        origin: params.origin,
        destination: params.destination,
        weight: params.weight
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format');
      }

      return response.data as ShippingMethod[];
    } catch (error) {
      logger.error('Failed to fetch shipping methods', { error });
      throw error;
    }
  }

  async generateShippingLabel(
    marketplaceId: string,
    orderId: string,
    shippingMethodId: string
  ): Promise<{ labelUrl: string; trackingNumber: string }> {
    try {
      logger.info('Generating shipping label', {
        marketplace: marketplaceId,
        orderId
      });

      const response = await this.client.request('generate_shipping_label', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        order_id: orderId,
        shipping_method_id: shippingMethodId
      });

      if (!response.data) {
        throw new Error('Failed to generate label');
      }

      return response.data as ReturnType<typeof this.generateShippingLabel>;
    } catch (error) {
      logger.error('Failed to generate shipping label', { error });
      throw error;
    }
  }

  async updateShipmentStatus(
    marketplaceId: string,
    shipmentId: string,
    status: string
  ): Promise<boolean> {
    try {
      logger.info('Updating shipment status', {
        marketplace: marketplaceId,
        shipmentId,
        status
      });

      const response = await this.client.request('update_shipment_status', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        shipment_id: shipmentId,
        status
      });

      logger.info('Shipment status updated');
      return !!response.status;
    } catch (error) {
      logger.error('Failed to update shipment status', { error });
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
