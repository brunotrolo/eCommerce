import { MarketplaceClient } from '../client';

describe('MarketplaceClient', () => {
  it('should initialize with config', () => {
    const config = {
      apiKey: 'mc_live_test123',
      endpoint: 'https://mcp.tiops.com.br'
    };
    const client = new MarketplaceClient(config);
    expect(client).toBeDefined();
  });
});
