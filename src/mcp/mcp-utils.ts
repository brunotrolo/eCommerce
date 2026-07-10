import McpClient, { McpAction, McpAccount } from './mcp-client';

/**
 * Utilitários auxiliares para o MCP Client
 */

/**
 * Agrupar ações por marketplace
 */
export function groupActionsByMarketplace(
  actions: McpAction[]
): Record<string, McpAction[]> {
  const grouped: Record<string, McpAction[]> = {};

  actions.forEach(action => {
    if (!grouped[action.marketplace]) {
      grouped[action.marketplace] = [];
    }
    grouped[action.marketplace].push(action);
  });

  return grouped;
}

/**
 * Contar ações por marketplace
 */
export function countActionsByMarketplace(
  actions: McpAction[]
): Record<string, number> {
  const grouped = groupActionsByMarketplace(actions);
  const counts: Record<string, number> = {};

  Object.entries(grouped).forEach(([marketplace, acts]) => {
    counts[marketplace] = acts.length;
  });

  return counts;
}

/**
 * Gerar relatório de ações disponíveis
 */
export function generateActionsReport(actions: McpAction[]): string {
  const grouped = groupActionsByMarketplace(actions);
  const counts = countActionsByMarketplace(actions);

  let report = `\n╔════════════════════════════════════════════╗\n`;
  report += `║  Relatório de Ações Marketplace Connect   ║\n`;
  report += `╚════════════════════════════════════════════╝\n\n`;

  report += `Total: ${actions.length} ações\n\n`;

  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([marketplace, count]) => {
      report += `${marketplace.padEnd(20)} | ${String(count).padStart(3)} ações\n`;
    });

  return report;
}

/**
 * Criar mapa de ações por ID
 */
export function createActionMap(
  actions: McpAction[]
): Map<string, McpAction> {
  const map = new Map<string, McpAction>();
  actions.forEach(action => {
    map.set(action.name, action);
  });
  return map;
}

/**
 * Encontrar ações relacionadas por padrão fuzzy
 */
export function fuzzySearchActions(
  actions: McpAction[],
  query: string
): McpAction[] {
  const q = query.toLowerCase();
  return actions.filter(action => {
    const name = action.name.toLowerCase();
    const desc = action.description.toLowerCase();
    const mp = action.marketplace.toLowerCase();

    // Busca exata em qualquer campo
    if (name.includes(q) || desc.includes(q) || mp.includes(q)) {
      return true;
    }

    // Busca de todas as palavras do query
    const words = q.split(/\s+/);
    return words.every(word => name.includes(word) || desc.includes(word));
  });
}

/**
 * Gerar resumo de conta conectada
 */
export function formatAccountSummary(account: McpAccount): string {
  const lines = [
    `📦 ${account.name}`,
    `   Marketplace: ${account.marketplace}`,
    `   Parâmetro: ${account.param_to_use}`,
    `   Valor: ${account.value}`
  ];

  if (account.email) {
    lines.push(`   Email: ${account.email}`);
  }

  if (account.tags && account.tags.length > 0) {
    lines.push(`   Tags: ${account.tags.join(', ')}`);
  }

  if (account.created_at) {
    lines.push(`   Criada: ${new Date(account.created_at).toLocaleDateString('pt-BR')}`);
  }

  return lines.join('\n');
}

/**
 * Gerar relatório de contas conectadas
 */
export function generateAccountsReport(accounts: McpAccount[]): string {
  const byMarketplace: Record<string, McpAccount[]> = {};

  accounts.forEach(account => {
    if (!byMarketplace[account.marketplace]) {
      byMarketplace[account.marketplace] = [];
    }
    byMarketplace[account.marketplace].push(account);
  });

  let report = `\n╔════════════════════════════════════════════╗\n`;
  report += `║  Contas Conectadas                         ║\n`;
  report += `╚════════════════════════════════════════════╝\n\n`;

  report += `Total: ${accounts.length} conta(s)\n\n`;

  Object.entries(byMarketplace).forEach(([marketplace, accs]) => {
    report += `${marketplace.toUpperCase()} (${accs.length}):\n`;
    accs.forEach(acc => {
      report += `  • ${acc.name} → ${acc.param_to_use}: ${acc.value}\n`;
    });
    report += '\n';
  });

  return report;
}

/**
 * Validar que todas as contas necessárias estão conectadas
 */
export function validateConnectedMarketplaces(
  accounts: McpAccount[],
  required: string[]
): { valid: boolean; missing: string[] } {
  const connected = accounts.map(a => a.marketplace.toLowerCase());
  const missing = required.filter(
    mp => !connected.includes(mp.toLowerCase())
  );

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Encontrar parâmetro ID de uma ação para um marketplace
 */
export function getMarketplaceIdParam(marketplace: string): string {
  const paramMap: Record<string, string> = {
    mercado_libre: 'meliUserId',
    mercado_livre: 'meliUserId',
    shopee: 'shopId',
    shein: 'supplierId',
    bling: 'authUserId',
    olist: 'sellerId'
  };

  return paramMap[marketplace.toLowerCase()] || `${marketplace}Id`;
}

/**
 * Preparar parâmetros de uma ação usando conta automaticamente
 */
export function prepareActionParams(
  account: McpAccount,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    [account.param_to_use]: account.value,
    ...params
  };
}

/**
 * Criar batch de requisições (útil para operações em lote)
 */
export async function executeBatch<T>(
  client: McpClient,
  actions: Array<{
    name: string;
    params: Record<string, unknown>;
  }>,
  maxConcurrent = 5
): Promise<Array<{ action: string; result: T | null; error?: string }>> {
  const results: Array<{ action: string; result: T | null; error?: string }> = [];
  const queue = [...actions];
  const executing = new Set<Promise<void>>();

  while (queue.length > 0 || executing.size > 0) {
    while (executing.size < maxConcurrent && queue.length > 0) {
      const action = queue.shift()!;

      const promise = client
        .call<T>(action.name, action.params)
        .then(result => {
          results.push({
            action: action.name,
            result: result.data as T || null,
            error: result.error
          });
        })
        .catch(error => {
          results.push({
            action: action.name,
            result: null,
            error: error.message
          });
        })
        .finally(() => {
          executing.delete(promise);
        });

      executing.add(promise);
    }

    if (executing.size > 0) {
      await Promise.race(executing);
    }
  }

  return results;
}

/**
 * Transformar resposta de ações em formato tabular
 */
export function formatActionsTable(
  actions: McpAction[],
  limit = 50
): string {
  const display = actions.slice(0, limit);

  let table = '\n┌─────────────────────────────────┬──────────────┬──────────────────────────┐\n';
  table += '│ Ação                            │ Marketplace  │ Descrição                │\n';
  table += '├─────────────────────────────────┼──────────────┼──────────────────────────┤\n';

  display.forEach(action => {
    const name = action.name.substring(0, 31).padEnd(31);
    const mp = action.marketplace.substring(0, 12).padEnd(12);
    const desc = action.description.substring(0, 24).padEnd(24);
    table += `│ ${name} │ ${mp} │ ${desc} │\n`;
  });

  table += '└─────────────────────────────────┴──────────────┴──────────────────────────┘\n';

  if (actions.length > limit) {
    table += `\n(Mostrando ${limit} de ${actions.length} ações)\n`;
  }

  return table;
}

/**
 * Exportar ações para CSV
 */
export function exportActionsToCSV(actions: McpAction[]): string {
  let csv = 'name,marketplace,description\n';

  actions.forEach(action => {
    const name = `"${action.name.replace(/"/g, '""')}"`;
    const marketplace = `"${action.marketplace.replace(/"/g, '""')}"`;
    const description = `"${action.description.replace(/"/g, '""')}"`;
    csv += `${name},${marketplace},${description}\n`;
  });

  return csv;
}

/**
 * Exportar contas para JSON
 */
export function exportAccountsToJSON(accounts: McpAccount[]): string {
  return JSON.stringify(accounts, null, 2);
}

export default {
  groupActionsByMarketplace,
  countActionsByMarketplace,
  generateActionsReport,
  createActionMap,
  fuzzySearchActions,
  formatAccountSummary,
  generateAccountsReport,
  validateConnectedMarketplaces,
  getMarketplaceIdParam,
  prepareActionParams,
  executeBatch,
  formatActionsTable,
  exportActionsToCSV,
  exportAccountsToJSON
};
