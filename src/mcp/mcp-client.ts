import axios, { AxiosInstance } from 'axios';
import logger from '../logger';

export interface McpAction {
  name: string;
  description: string;
  marketplace: string;
}

export interface McpActionDescriptor {
  name: string;
  description: string;
  marketplace: string;
  params: Record<string, {
    type: string;
    required?: boolean;
    enum?: string[];
    description?: string;
    default?: unknown;
  }>;
}

export interface McpAccount {
  id: string;
  name: string;
  marketplace: string;
  param_to_use: string;
  value: string;
  email?: string;
  created_at?: string;
  tags?: string[];
}

export interface McpApiResponse<T = unknown> {
  status?: number;
  data?: T;
  error?: string;
}

/**
 * Cliente MCP otimizado para Marketplace Connect API
 * Suporta descoberta de ações, introspection e execução com retry
 */
export class McpClient {
  private client: AxiosInstance;
  private actionsCache: Map<string, McpAction> = new Map();
  private actionDescriptorCache: Map<string, McpActionDescriptor> = new Map();
  private accountsCache: Map<string, McpAccount[]> = new Map();
  private cacheExpiry: number = 3600000; // 1 hora em ms

  constructor(apiKey: string, endpoint = 'https://mcp.tiops.com.br') {
    this.client = axios.create({
      baseURL: endpoint,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Chamar qualquer ação da API
   */
  async call<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<McpApiResponse<T>> {
    try {
      logger.info(`[MCP] Executando ação: ${action}`, { params });

      const response = await this.client.post<McpApiResponse<T>>(
        '/',
        { action, params }
      );

      if (response.data.error) {
        logger.error(`[MCP] Erro na ação ${action}: ${response.data.error}`);
        throw new Error(response.data.error);
      }

      logger.info(`[MCP] Ação ${action} completada com sucesso`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error || error.message;
        logger.error(`[MCP] Falha ao executar ${action}: ${message}`);
        throw new Error(`MCP Error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Descobrir todas as ações disponíveis (260+)
   */
  async discoverActions(useCache = true): Promise<McpAction[]> {
    try {
      if (useCache && this.actionsCache.size > 0) {
        logger.info('[MCP] Retornando ações do cache');
        return Array.from(this.actionsCache.values());
      }

      logger.info('[MCP] Descobrindo todas as ações disponíveis');
      const response = await this.call<{
        total: number;
        actions: McpAction[];
      }>('list_actions');

      if (!response.data?.actions) {
        throw new Error('Nenhuma ação retornada');
      }

      // Cache as ações
      response.data.actions.forEach(action => {
        this.actionsCache.set(action.name, action);
      });

      logger.info(`[MCP] Descobertas ${response.data.total} ações`);
      return response.data.actions;
    } catch (error) {
      logger.error('[MCP] Falha ao descobrir ações', { error });
      throw error;
    }
  }

  /**
   * Descrever parâmetros de uma ação específica
   */
  async describeAction(
    actionName: string,
    useCache = true
  ): Promise<McpActionDescriptor> {
    try {
      if (useCache && this.actionDescriptorCache.has(actionName)) {
        logger.info(`[MCP] Retornando descrição de ${actionName} do cache`);
        return this.actionDescriptorCache.get(actionName)!;
      }

      logger.info(`[MCP] Descrevendo ação: ${actionName}`);
      const response = await this.call<McpActionDescriptor>(
        'describe_action',
        { action_name: actionName }
      );

      if (!response.data) {
        throw new Error(`Descrição não encontrada para ${actionName}`);
      }

      this.actionDescriptorCache.set(actionName, response.data);
      return response.data;
    } catch (error) {
      logger.error(`[MCP] Falha ao descrever ${actionName}`, { error });
      throw error;
    }
  }

  /**
   * Listar contas conectadas com seus parâmetros
   */
  async listAccounts(useCache = true): Promise<McpAccount[]> {
    try {
      const cacheKey = 'all_accounts';

      if (useCache && this.accountsCache.has(cacheKey)) {
        logger.info('[MCP] Retornando contas do cache');
        return this.accountsCache.get(cacheKey)!;
      }

      logger.info('[MCP] Listando contas conectadas');
      const response = await this.call<{
        accounts: McpAccount[];
        total: number;
      }>('list_accounts');

      if (!response.data?.accounts) {
        throw new Error('Nenhuma conta retornada');
      }

      this.accountsCache.set(cacheKey, response.data.accounts);
      logger.info(
        `[MCP] Encontradas ${response.data.total} contas conectadas`
      );

      return response.data.accounts;
    } catch (error) {
      logger.error('[MCP] Falha ao listar contas', { error });
      throw error;
    }
  }

  /**
   * Obter conta específica por marketplace
   */
  async getAccountByMarketplace(
    marketplace: string,
    useCache = true
  ): Promise<McpAccount | undefined> {
    try {
      const accounts = await this.listAccounts(useCache);
      return accounts.find(
        acc => acc.marketplace.toLowerCase() === marketplace.toLowerCase()
      );
    } catch (error) {
      logger.error(
        `[MCP] Falha ao obter conta de ${marketplace}`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Obter todas as contas de um marketplace específico
   */
  async getAccountsByMarketplace(
    marketplace: string,
    useCache = true
  ): Promise<McpAccount[]> {
    try {
      const accounts = await this.listAccounts(useCache);
      return accounts.filter(
        acc => acc.marketplace.toLowerCase() === marketplace.toLowerCase()
      );
    } catch (error) {
      logger.error(
        `[MCP] Falha ao obter contas de ${marketplace}`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Buscar ações por marketplace
   */
  async findActionsByMarketplace(
    marketplace: string,
    useCache = true
  ): Promise<McpAction[]> {
    try {
      const actions = await this.discoverActions(useCache);
      return actions.filter(
        action =>
          action.marketplace.toLowerCase() === marketplace.toLowerCase()
      );
    } catch (error) {
      logger.error(
        `[MCP] Falha ao buscar ações de ${marketplace}`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Buscar ações por padrão de nome
   */
  async searchActions(
    pattern: string,
    useCache = true
  ): Promise<McpAction[]> {
    try {
      const actions = await this.discoverActions(useCache);
      const regex = new RegExp(pattern, 'i');
      return actions.filter(
        action =>
          regex.test(action.name) || regex.test(action.description)
      );
    } catch (error) {
      logger.error(`[MCP] Falha ao buscar ações com padrão "${pattern}"`, {
        error
      });
      throw error;
    }
  }

  /**
   * Validar parâmetros contra o schema de uma ação
   */
  async validateParams(
    actionName: string,
    params: Record<string, unknown>
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const descriptor = await this.describeAction(actionName);
      const errors: string[] = [];

      // Validar parâmetros obrigatórios
      for (const [paramName, paramSpec] of Object.entries(
        descriptor.params
      )) {
        if (paramSpec.required && !(paramName in params)) {
          errors.push(`Parâmetro obrigatório ausente: ${paramName}`);
        }

        // Validar enum
        if (
          paramName in params &&
          paramSpec.enum &&
          !paramSpec.enum.includes(String(params[paramName]))
        ) {
          errors.push(
            `Valor inválido para ${paramName}. Valores permitidos: ${paramSpec.enum.join(', ')}`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error(`[MCP] Falha ao validar parâmetros de ${actionName}`, {
        error
      });
      throw error;
    }
  }

  /**
   * Executar ação com validação e retry automático
   */
  async callWithValidation<T = unknown>(
    actionName: string,
    params: Record<string, unknown> = {},
    maxRetries = 3
  ): Promise<McpApiResponse<T>> {
    try {
      // Validar parâmetros
      const validation = await this.validateParams(actionName, params);
      if (!validation.valid) {
        throw new Error(
          `Parâmetros inválidos: ${validation.errors.join('; ')}`
        );
      }

      // Executar com retry
      return await this.callWithRetry<T>(actionName, params, maxRetries);
    } catch (error) {
      logger.error(
        `[MCP] Falha ao executar ${actionName} com validação`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Executar ação com retry automático e backoff exponencial
   */
  async callWithRetry<T = unknown>(
    action: string,
    params: Record<string, unknown> = {},
    maxRetries = 3
  ): Promise<McpApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info(`[MCP] Tentativa ${attempt + 1}/${maxRetries}: ${action}`);
        return await this.call<T>(action, params);
      } catch (error) {
        lastError = error as Error;

        // Verificar se é erro recuperável
        const errorMsg = lastError.message.toLowerCase();
        if (
          errorMsg.includes('rate_limit') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('connection')
        ) {
          if (attempt < maxRetries - 1) {
            const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            logger.warn(
              `[MCP] Erro recuperável em ${action}. Aguardando ${backoffMs}ms...`,
              { attempt, error: lastError.message }
            );
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
        }

        // Erro não recuperável
        throw lastError;
      }
    }

    throw lastError || new Error('Máximo de tentativas excedido');
  }

  /**
   * Limpar cache
   */
  clearCache(type?: 'actions' | 'descriptors' | 'accounts' | 'all'): void {
    if (type === 'actions' || type === 'all') {
      this.actionsCache.clear();
    }
    if (type === 'descriptors' || type === 'all') {
      this.actionDescriptorCache.clear();
    }
    if (type === 'accounts' || type === 'all') {
      this.accountsCache.clear();
    }
    logger.info(`[MCP] Cache limpo: ${type || 'all'}`);
  }

  /**
   * Obter estatísticas do cache
   */
  getCacheStats() {
    return {
      actions: this.actionsCache.size,
      descriptors: this.actionDescriptorCache.size,
      accounts: this.accountsCache.size,
      total: this.actionsCache.size + this.actionDescriptorCache.size + this.accountsCache.size
    };
  }
}

export default McpClient;
