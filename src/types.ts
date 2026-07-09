export interface MarketplaceConfig {
  apiKey: string;
  endpoint: string;
}

export interface ApiRequest {
  action: string;
  params: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
}

export interface Account {
  id: string;
  name: string;
  marketplace: string;
  param_to_use: string;
  value: string;
}

export interface ActionDescription {
  name: string;
  description: string;
  params: Record<string, unknown>;
  marketplace: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  marketplace: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: number;
  buyer: string;
  items: OrderItem[];
  marketplace: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  quantity: number;
  price: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  budget: number;
  spent: number;
  marketplace: string;
}

export interface ShippingInfo {
  id: string;
  orderId: string;
  status: string;
  carrier: string;
  trackingCode: string;
  estimatedDelivery: string;
}

export interface ActionDiscovery {
  total: number;
  actions: Array<{
    name: string;
    description: string;
    marketplace: string;
  }>;
}

export interface ListAccountsResponse {
  accounts: Account[];
  total: number;
}
