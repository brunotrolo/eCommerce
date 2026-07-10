import McpClient from './mcp-client';
import logger from '../logger';

/**
 * Exemplos de uso do Cliente MCP para integração com Marketplace Connect API.
 */

async function example1_DiscoverActions() {
  console.log('\n=== Exemplo 1: Descobrir Todas as Ações ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Listar todas as 260+ ações
    const actions = await client.discoverActions();

    console.log(`Total de ações disponíveis: ${actions.length}\n`);

    // Agrupar por marketplace
    const byMarketplace: Record<string, typeof actions> = {};
    actions.forEach(action => {
      if (!byMarketplace[action.marketplace]) {
        byMarketplace[action.marketplace] = [];
      }
      byMarketplace[action.marketplace].push(action);
    });

    // Exibir resumo
    Object.entries(byMarketplace).forEach(([mp, acts]) => {
      console.log(`${mp}: ${acts.length} ações`);
    });

    // Amostra de ações
    console.log('\nAmostra de ações:');
    actions.slice(0, 5).forEach(action => {
      console.log(`  - ${action.name}: ${action.description}`);
    });
  } catch (error) {
    logger.error('Erro em example1', { error });
  }
}

async function example2_DescribeAction() {
  console.log('\n=== Exemplo 2: Descrever Ação Específica ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Descrever ação do Shopee
    const descriptor = await client.describeAction('shopee_sales_summary');

    console.log(`Nome: ${descriptor.name}`);
    console.log(`Descrição: ${descriptor.description}`);
    console.log(`Marketplace: ${descriptor.marketplace}\n`);

    console.log('Parâmetros:');
    Object.entries(descriptor.params).forEach(([name, spec]) => {
      const required = spec.required ? '(obrigatório)' : '(opcional)';
      console.log(
        `  - ${name}: ${spec.type} ${required} - ${spec.description || ''}`
      );
      if (spec.enum) {
        console.log(`    Valores: ${spec.enum.join(', ')}`);
      }
      if (spec.default !== undefined) {
        console.log(`    Padrão: ${spec.default}`);
      }
    });
  } catch (error) {
    logger.error('Erro em example2', { error });
  }
}

async function example3_ListAccounts() {
  console.log('\n=== Exemplo 3: Listar Contas Conectadas ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    const accounts = await client.listAccounts();

    console.log(`Total de contas: ${accounts.length}\n`);

    accounts.forEach(account => {
      console.log(`Nome: ${account.name}`);
      console.log(`  Marketplace: ${account.marketplace}`);
      console.log(`  Parâmetro: ${account.param_to_use}`);
      console.log(`  Valor: ${account.value}`);
      if (account.email) console.log(`  Email: ${account.email}`);
      if (account.tags) console.log(`  Tags: ${account.tags.join(', ')}`);
      console.log();
    });
  } catch (error) {
    logger.error('Erro em example3', { error });
  }
}

async function example4_FindActionsByMarketplace() {
  console.log('\n=== Exemplo 4: Buscar Ações de Um Marketplace ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Buscar ações do Shopee
    const shopeeActions = await client.findActionsByMarketplace('shopee');
    console.log(`Ações do Shopee: ${shopeeActions.length}\n`);

    // Exibir primeiras 5
    shopeeActions.slice(0, 5).forEach(action => {
      console.log(`  - ${action.name}`);
    });

    // Buscar ações do Mercado Libre
    const mlActions = await client.findActionsByMarketplace('mercado_libre');
    console.log(`\nAções do Mercado Libre: ${mlActions.length}`);
  } catch (error) {
    logger.error('Erro em example4', { error });
  }
}

async function example5_SearchActions() {
  console.log('\n=== Exemplo 5: Buscar Ações por Padrão ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Buscar ações relacionadas a "sales"
    const salesActions = await client.searchActions('sales');
    console.log(`Ações com "sales": ${salesActions.length}\n`);

    salesActions.forEach(action => {
      console.log(`  - ${action.name} (${action.marketplace})`);
    });

    // Buscar ações de "inventory"
    const inventoryActions = await client.searchActions('inventory');
    console.log(`\nAções com "inventory": ${inventoryActions.length}\n`);

    inventoryActions.slice(0, 5).forEach(action => {
      console.log(`  - ${action.name} (${action.marketplace})`);
    });
  } catch (error) {
    logger.error('Erro em example5', { error });
  }
}

async function example6_ValidateParams() {
  console.log('\n=== Exemplo 6: Validar Parâmetros ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Validar parâmetros válidos
    const validParams = {
      shopId: 'shop_123456',
      dateRange: 'last_30_days'
    };

    const result1 = await client.validateParams(
      'shopee_sales_summary',
      validParams
    );
    console.log('Validação 1 (válido):', result1);

    // Validar parâmetros inválidos
    const invalidParams = {
      shopId: 'shop_123456',
      dateRange: 'invalid_range' // Valor inválido
    };

    const result2 = await client.validateParams(
      'shopee_sales_summary',
      invalidParams
    );
    console.log('\nValidação 2 (inválido):', result2);

    // Validar parâmetro obrigatório faltando
    const missingParams = {
      dateRange: 'last_30_days'
      // shopId está faltando
    };

    const result3 = await client.validateParams(
      'shopee_sales_summary',
      missingParams
    );
    console.log('\nValidação 3 (parâmetro faltando):', result3);
  } catch (error) {
    logger.error('Erro em example6', { error });
  }
}

async function example7_CacheStats() {
  console.log('\n=== Exemplo 7: Estatísticas de Cache ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    console.log('Cache inicial:', client.getCacheStats());

    // Fazer algumas chamadas
    await client.discoverActions();
    console.log('\nApós listar ações:', client.getCacheStats());

    await client.describeAction('shopee_sales_summary');
    console.log('Após descrever ação:', client.getCacheStats());

    await client.listAccounts();
    console.log('Após listar contas:', client.getCacheStats());

    // Limpar cache
    client.clearCache('actions');
    console.log('\nApós limpar ações:', client.getCacheStats());

    client.clearCache('all');
    console.log('Após limpar tudo:', client.getCacheStats());
  } catch (error) {
    logger.error('Erro em example7', { error });
  }
}

async function example8_RetryLogic() {
  console.log('\n=== Exemplo 8: Lógica de Retry com Backoff ===');

  const client = new McpClient(process.env.MARKETPLACE_API_KEY!);

  try {
    // Chamar com retry automático
    const result = await client.callWithRetry(
      'shopee_sales_summary',
      {
        shopId: 'shop_123456',
        dateRange: 'last_30_days'
      },
      3 // máximo 3 tentativas
    );

    console.log('Resultado:', result.status);
    if (result.data) {
      console.log('Dados recebidos:', Object.keys(result.data));
    }
  } catch (error) {
    logger.error('Erro em example8 (esperado se conta não conectada)', {
      error
    });
  }
}

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  Exemplos de Uso - MCP Client                  ║');
  console.log('╚════════════════════════════════════════════════╝');

  try {
    await example1_DiscoverActions();
    await example2_DescribeAction();
    await example3_ListAccounts();
    await example4_FindActionsByMarketplace();
    await example5_SearchActions();
    await example6_ValidateParams();
    await example7_CacheStats();
    await example8_RetryLogic();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  Todos os exemplos completados!                ║');
    console.log('╚════════════════════════════════════════════════╝');
  } catch (error) {
    logger.error('Erro ao executar exemplos', { error });
  }
}

if (require.main === module) {
  runAllExamples();
}

export { runAllExamples };
export default runAllExamples;
