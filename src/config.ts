import dotenv from 'dotenv';
import { MarketplaceConfig } from './types';

dotenv.config();

if (!process.env.MARKETPLACE_API_KEY) {
  throw new Error('MARKETPLACE_API_KEY environment variable is required');
}

export const config: MarketplaceConfig = {
  apiKey: process.env.MARKETPLACE_API_KEY,
  endpoint: process.env.MARKETPLACE_API_ENDPOINT || 'https://mcp.tiops.com.br'
};

export default config;
