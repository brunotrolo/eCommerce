/**
 * ServiceRegistry — catálogo e dispatcher dos serviços internos, no mesmo
 * espírito do list_actions/describe_action da própria Tiops: cada serviço
 * descreve suas ações e schema, e o dispatch valida params antes de chamar.
 */
var ServiceRegistry = (function () {
  // Blindagem contra ordem de carregamento: `typeof X !== 'undefined'` nunca
  // lança ReferenceError, mesmo se X ainda não tiver sido definido (arquivo
  // não carregado / fora de ordem / com erro de sintaxe). Referenciar o
  // namespace diretamente aqui (ex.: `pricing: PricingService`) quebraria a
  // inicialização do script inteiro — e como GAS roda tudo num único
  // contexto global, um serviço quebrado derrubaria doGet() para TODAS as
  // páginas, não só a do serviço com problema. Ao adicionar um novo serviço,
  // siga este padrão (nunca referencie o namespace direto).
  function safeRef_(name, ref) {
    try {
      if (typeof ref() === 'undefined') {
        console.warn('[ServiceRegistry] Serviço "' + name + '" não carregado (undefined).');
        return null;
      }
      return ref();
    } catch (e) {
      console.warn('[ServiceRegistry] Serviço "' + name + '" falhou ao carregar: ' + e.message);
      return null;
    }
  }

  var services = {
    config: safeRef_('config', function () { return typeof ConfigService !== 'undefined' ? ConfigService : undefined; }),
    pricing: safeRef_('pricing', function () { return typeof PricingService !== 'undefined' ? PricingService : undefined; }),
    orders: safeRef_('orders', function () { return typeof OrdersService !== 'undefined' ? OrdersService : undefined; }),
    dashboard: safeRef_('dashboard', function () { return typeof DashboardService !== 'undefined' ? DashboardService : undefined; }),
    nfeEntrada: safeRef_('nfeEntrada', function () { return typeof NFeEntradaService !== 'undefined' ? NFeEntradaService : undefined; }),
    nfeEntradaProdutos: safeRef_('nfeEntradaProdutos', function () { return typeof NFeEntradaProdutosService !== 'undefined' ? NFeEntradaProdutosService : undefined; }),
    calculator: safeRef_('calculator', function () { return typeof CalculatorService !== 'undefined' ? CalculatorService : undefined; }),
    logging: safeRef_('logging', function () { return typeof LoggingService !== 'undefined' ? LoggingService : undefined; }),
    catalog: safeRef_('catalog', function () { return typeof CatalogService !== 'undefined' ? CatalogService : undefined; }),
    system: safeRef_('system', function () { return typeof StatusService !== 'undefined' ? StatusService : undefined; }),
    manualEntrada: safeRef_('manualEntrada', function () { return typeof ManualEntradaService !== 'undefined' ? ManualEntradaService : undefined; }),
    manualSaida: safeRef_('manualSaida', function () { return typeof ManualSaidaService !== 'undefined' ? ManualSaidaService : undefined; }),
    estoque: safeRef_('estoque', function () { return typeof EstoqueService !== 'undefined' ? EstoqueService : undefined; }),
    estoqueBaixa: safeRef_('estoqueBaixa', function () { return typeof EstoqueBaixaService !== 'undefined' ? EstoqueBaixaService : undefined; }),
    estoquePreco: safeRef_('estoquePreco', function () { return typeof EstoquePrecoService !== 'undefined' ? EstoquePrecoService : undefined; }),
    ordersImport: safeRef_('ordersImport', function () { return typeof OrdersImportService !== 'undefined' ? OrdersImportService : undefined; }),
    pushNotification: safeRef_('pushNotification', function () { return typeof PushNotificationService !== 'undefined' ? PushNotificationService : undefined; }),
    carteiraShopee: safeRef_('carteiraShopee', function () { return typeof CarteiraShopeeService !== 'undefined' ? CarteiraShopeeService : undefined; }),
    anunciosShopee: safeRef_('anunciosShopee', function () { return typeof AnunciosShopeeService !== 'undefined' ? AnunciosShopeeService : undefined; }),
    shopeeAds: safeRef_('shopeeAds', function () { return typeof ShopeeAdsService !== 'undefined' ? ShopeeAdsService : undefined; }),
    sku: safeRef_('sku', function () { return typeof SkuService !== 'undefined' ? SkuService : undefined; })
  };

  function listActions() {
    return Object.keys(services)
      .filter(function (key) { return !!services[key]; })
      .map(function (key) {
        return services[key].describe();
      });
  }

  function describeAction(actionFullName) {
    var parsed = parse_(actionFullName);
    if (parsed.error) return parsed;
    return parsed.spec;
  }

  function dispatch(actionFullName, params) {
    if (actionFullName === 'ping') {
      return { status: 200, data: { pong: true, time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss') } };
    }

    var parsed = parse_(actionFullName);
    if (parsed.error) return { error: parsed.error };

    var validationError = validateParams_(parsed.spec.params, params || {});
    if (validationError) return { error: validationError };

    var startTime = Date.now();
    var serviceName = actionFullName.split('.')[0];
    var methodName = actionFullName.split('.')[1];

    try {
      var data = parsed.service[parsed.methodName](params || {});
      var durationMs = Date.now() - startTime;

      if (serviceName !== 'logging') {
        LoggingService.logAction(serviceName, methodName, params, data, startTime);
      }

      if (data && data.error) return { error: data.error };
      return { status: 200, data: sanitizeForClient_(data) };
    } catch (err) {
      var durationMs = Date.now() - startTime;

      if (serviceName !== 'logging') {
        LoggingService.logAction(serviceName, methodName, params, { error: err.message }, startTime);
      }

      return { error: err.message };
    } finally {
      if (typeof LoggingService !== 'undefined' && LoggingService.flushLogs) {
        try { LoggingService.flushLogs(); } catch (e) { /* ignore */ }
      }
    }
  }

  function parse_(actionFullName) {
    if (!actionFullName || actionFullName.indexOf('.') === -1) {
      return { error: 'Ação inválida, use "<servico>.<acao>": ' + actionFullName };
    }
    var parts = actionFullName.split('.');
    var serviceName = parts[0];
    var methodName = parts[1];
    var service = services[serviceName];
    if (!service) return { error: 'Serviço desconhecido: ' + serviceName };

    var spec = service.describe().actions[methodName];
    if (!spec) return { error: 'Ação desconhecida: ' + actionFullName };

    return { service: service, methodName: methodName, spec: spec };
  }

  function validateParams_(schema, params) {
    schema = schema || {};
    var keys = Object.keys(schema);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var rule = schema[key];
      var value = params[key];

      if (rule.required && (value === undefined || value === null || value === '')) {
        return 'Parâmetro obrigatório ausente: ' + key;
      }
      if (value === undefined || value === null) continue;
      if (rule.type === 'number' && typeof value !== 'number') {
        return 'Parâmetro ' + key + ' deve ser number.';
      }
      if (rule.type === 'string' && typeof value !== 'string') {
        return 'Parâmetro ' + key + ' deve ser string.';
      }
      if (rule.enum && rule.enum.indexOf(value) === -1) {
        return 'Parâmetro ' + key + ' deve ser um de: ' + rule.enum.join(', ');
      }
      if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
        return 'Parâmetro ' + key + ' deve ser >= ' + rule.min + '.';
      }
      if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
        return 'Parâmetro ' + key + ' deve ser <= ' + rule.max + '.';
      }
      if (rule.pattern && typeof value === 'string' && !(new RegExp(rule.pattern)).test(value)) {
        return 'Parâmetro ' + key + ' não atende ao padrão: ' + rule.pattern;
      }
    }
    return null;
  }

  /**
   * Sanitiza objeto para transporte via google.script.run / JSON. O cliente
   * do Apps Script NÃO serializa Date → devolve null. Converte Date para
   * string no padrão brasileiro (dd/MM/yyyy HH:mm:ss) e undefined para ''
   * antes de sair do dispatcher.
   */
  function sanitizeForClient_(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return 0;
    if (Array.isArray(value)) {
      return value.map(sanitizeForClient_);
    }
    if (typeof value === 'object') {
      var out = {};
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = value[k];
        if (typeof v === 'function' || typeof v === 'undefined') continue;
        out[k] = sanitizeForClient_(v);
      }
      return out;
    }
    return value;
  }

  return {
    services: services,
    listActions: listActions,
    describeAction: describeAction,
    dispatch: dispatch,
    sanitizeForClient: sanitizeForClient_
  };
})();
