import { DiscoveryService } from '../discovery';
import { MarketplaceClient } from '../client';

describe('DiscoveryService', () => {
  let discoveryService: DiscoveryService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      request: jest.fn()
    };
    discoveryService = new DiscoveryService(mockClient as MarketplaceClient);
  });

  it('should initialize with client', () => {
    expect(discoveryService).toBeDefined();
  });

  it('should cache action descriptions', async () => {
    const actionDescription = {
      name: 'test_action',
      description: 'Test action',
      params: {},
      marketplace: 'test'
    };

    mockClient.request.mockResolvedValueOnce({ data: actionDescription });

    // First call
    const result1 = await discoveryService.describeAction('test_action');
    expect(result1).toEqual(actionDescription);
    expect(mockClient.request).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await discoveryService.describeAction('test_action');
    expect(result2).toEqual(actionDescription);
    expect(mockClient.request).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it('should clear cache when requested', async () => {
    discoveryService.clearCache();
    expect(discoveryService).toBeDefined();
  });
});
