import { MarketplaceClient } from '../client';
import { Campaign } from '../types';
import logger from '../logger';

export interface ListCampaignsParams {
  marketplaceId: string;
  status?: 'active' | 'paused' | 'ended' | 'scheduled';
  offset?: number;
  limit?: number;
}

export interface CreateCampaignParams {
  marketplaceId: string;
  name: string;
  type: 'sponsored' | 'search' | 'display';
  budget: number;
  dailyBudget?: number;
  productIds: string[];
  keywords?: string[];
}

export class CampaignsService {
  private client: MarketplaceClient;

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async listCampaigns(params: ListCampaignsParams): Promise<Campaign[]> {
    try {
      logger.info('Listing campaigns', { marketplace: params.marketplaceId });

      const response = await this.client.request('list_campaigns', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        status: params.status || 'all',
        offset: params.offset || 0,
        limit: params.limit || 50
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from list_campaigns');
      }

      return response.data as Campaign[];
    } catch (error) {
      logger.error('Failed to list campaigns', { error });
      throw error;
    }
  }

  async getCampaignDetails(
    marketplaceId: string,
    campaignId: string
  ): Promise<Campaign> {
    try {
      logger.info('Fetching campaign details', {
        marketplace: marketplaceId,
        campaignId
      });

      const response = await this.client.request('get_campaign_details', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        campaign_id: campaignId
      });

      if (!response.data) {
        throw new Error('Campaign not found');
      }

      return response.data as Campaign;
    } catch (error) {
      logger.error('Failed to get campaign details', { error });
      throw error;
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<Campaign> {
    try {
      logger.info('Creating new campaign', {
        marketplace: params.marketplaceId,
        name: params.name
      });

      const response = await this.client.request('create_campaign', {
        [this.getMarketplaceIdParam(params.marketplaceId)]:
          params.marketplaceId,
        name: params.name,
        type: params.type,
        budget: params.budget,
        daily_budget: params.dailyBudget,
        product_ids: params.productIds,
        keywords: params.keywords
      });

      if (!response.data) {
        throw new Error('Failed to create campaign');
      }

      logger.info('Campaign created successfully');
      return response.data as Campaign;
    } catch (error) {
      logger.error('Failed to create campaign', { error });
      throw error;
    }
  }

  async updateCampaignStatus(
    marketplaceId: string,
    campaignId: string,
    status: 'active' | 'paused' | 'ended'
  ): Promise<boolean> {
    try {
      logger.info('Updating campaign status', {
        marketplace: marketplaceId,
        campaignId,
        status
      });

      const response = await this.client.request('update_campaign_status', {
        [this.getMarketplaceIdParam(marketplaceId)]: marketplaceId,
        campaign_id: campaignId,
        status
      });

      logger.info('Campaign status updated');
      return !!response.status;
    } catch (error) {
      logger.error('Failed to update campaign status', { error });
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
