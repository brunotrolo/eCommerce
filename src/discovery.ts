import { MarketplaceClient } from './client';
import {
  ActionDiscovery,
  ActionDescription,
  ListAccountsResponse,
  Account
} from './types';
import logger from './logger';

export class DiscoveryService {
  private client: MarketplaceClient;
  private actionsCache: Map<string, ActionDescription> = new Map();

  constructor(client: MarketplaceClient) {
    this.client = client;
  }

  async listAllActions(): Promise<ActionDiscovery> {
    try {
      logger.info('Fetching all available actions');
      const response = await this.client.request<ActionDiscovery>('list_actions');

      if (!response.data) {
        throw new Error('No data returned from list_actions');
      }

      logger.info(`Found ${response.data.total} available actions`);
      return response.data;
    } catch (error) {
      logger.error('Failed to list actions', { error });
      throw error;
    }
  }

  async describeAction(actionName: string): Promise<ActionDescription> {
    try {
      if (this.actionsCache.has(actionName)) {
        return this.actionsCache.get(actionName)!;
      }

      logger.info(`Describing action: ${actionName}`);
      const response = await this.client.request<ActionDescription>(
        'describe_action',
        { action_name: actionName }
      );

      if (!response.data) {
        throw new Error(`No description found for action ${actionName}`);
      }

      this.actionsCache.set(actionName, response.data);
      return response.data;
    } catch (error) {
      logger.error(`Failed to describe action ${actionName}`, { error });
      throw error;
    }
  }

  async listConnectedAccounts(): Promise<ListAccountsResponse> {
    try {
      logger.info('Fetching connected accounts');
      const response = await this.client.request<ListAccountsResponse>(
        'list_accounts'
      );

      if (!response.data) {
        throw new Error('No data returned from list_accounts');
      }

      logger.info(`Found ${response.data.total} connected accounts`);
      return response.data;
    } catch (error) {
      logger.error('Failed to list accounts', { error });
      throw error;
    }
  }

  async getAccountByMarketplace(
    marketplace: string
  ): Promise<Account | undefined> {
    try {
      const accounts = await this.listConnectedAccounts();
      return accounts.accounts.find(
        acc => acc.marketplace.toLowerCase() === marketplace.toLowerCase()
      );
    } catch (error) {
      logger.error(`Failed to get account for ${marketplace}`, { error });
      throw error;
    }
  }

  clearCache(): void {
    this.actionsCache.clear();
    logger.info('Action cache cleared');
  }
}
