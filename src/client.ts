import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { MarketplaceConfig, ApiRequest, ApiResponse } from './types';

export class MarketplaceClient {
  private client: AxiosInstance;
  private config: MarketplaceConfig;

  constructor(config: MarketplaceConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.endpoint,
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async request<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<ApiResponse<T>> {
    try {
      const payload: ApiRequest = { action, params };

      logger.info(`Making request to ${action}`, { params });

      const response = await this.client.post<ApiResponse<T>>('/', payload);

      if (response.data.error) {
        logger.error(`API error: ${response.data.error}`, { action });
        throw new Error(response.data.error);
      }

      logger.info(`Request successful for ${action}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message;
        logger.error(`Request failed: ${errorMessage}`, {
          action,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
        throw new Error(`API request failed: ${errorMessage}`);
      }
      throw error;
    }
  }
}
