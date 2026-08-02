/**
 * ServiceRegistry — catálogo e dispatcher dos serviços internos, no mesmo
 * espírito do list_actions/describe_action da própria Tiops: cada serviço
 * descreve suas ações e schema, e o dispatch valida params antes de chamar.
 */
var ServiceRegistry = (function () {
  var services = {
    pricing: PricingService,
    orders: OrdersService,
    listings: ListingsService,
    inventoryPricing: InventoryPricingService,
    dashboard: DashboardService,
    nfeEntrada: NFeEntradaService,
    logging: LoggingService
  };

  function listActions() {
    return Object.keys(services).map(function (key) {
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
      return { status: 200, data: { pong: true, time: new Date().toISOString() } };
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
      return { status: 200, data: data };
    } catch (err) {
      var durationMs = Date.now() - startTime;

      if (serviceName !== 'logging') {
        LoggingService.logAction(serviceName, methodName, params, { error: err.message }, startTime);
      }

      return { error: err.message };
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
    }
    return null;
  }

  return {
    services: services,
    listActions: listActions,
    describeAction: describeAction,
    dispatch: dispatch
  };
})();
